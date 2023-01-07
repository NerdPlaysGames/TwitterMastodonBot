/* eslint-disable no-unused-vars */
/* eslint-disable max-len */
'use strict';
require('dotenv').config();
const Logger = require('danno-tools').Logger;
let { Mastodon } = require('megalodon');
const moment = require('moment');
const cron = require('node-cron');
// eslint-disable-next-line no-shadow
const objectdiff = require('objectdiff');
const logger = new Logger({ WTF: true, path: './logs' });
const starbaseIO = require('socket.io-client').io(`wss://${process.env.starbase_host}`);
const { TwitterApi } = require('twitter-api-v2');

const twitterClient = new TwitterApi({
  accessSecret: process.env.twitter_access_token_secret,
  accessToken: process.env.twitter_access_token,
  appKey: process.env.twitter_consumer_key,
  appSecret: process.env.twitter_consumer_secret,
});

let rwClient = twitterClient.readWrite;

let mastodonClient = new Mastodon(`https://${process.env.mastodon_host}`, process.env.mastodon_access_token);

let keys = require('./keys.json');

starbaseIO.on('textmessages', (data) => {
  logger.log('New text message');
  let textString = `Starbase - New Text Message from Cameron County:\n${data}`;
  distribute(textString);
});

// Socket IO stuff
starbaseIO.on('connect', () => {
  logger.info('Socket Connected');
});

// For every new closure
starbaseIO.on('newClosure', (data) => {
  logger.log('New Closure');
  let regex = /(\w+,?\s)?(\w+)\s(\d+),\s(\d+)/;
  let match = data.date.match(regex);
  let date = moment(`${match[2]} ${match[3]}, ${match[4]}`, 'MMM D, YYYY');
  let dateString = date.format('M/D/YYYY');
  let closureString = `Starbase - New Closure:\n${data.type} ${dateString} ${data.status} ${data.time}`;
  distribute(closureString);
});

// Fires for every NOTAM
starbaseIO.on('newNOTAM', (data) => {
  logger.log('New NOTAM');
  let tfrString = `Starbase - New TFR (${data.tfrID})\n${data.dateStart} to ${data.dateEnd}\n${data.lowerAltitude}${data.units} - ${data.upperAltitude}${data.units}`;
  distribute(tfrString);
});

// Fires for every data update
starbaseIO.on('dataUpdatePub', async (data) => {
  let testingDiff = objectdiff.diff(data.old.testing, data.new.testing);
  let changes = {};
  await diffValueHandler(testingDiff, null, changes);

  let timingDiff = objectdiff.diff(data.old.timing, data.new.timing);
  await timingDiffHandler(timingDiff, null, changes);

  let changeString = [];

  for (const key in changes) {
    const difference = changes[key];
    changeString.push(`${keys[key]}: ${difference.removed} => ${difference.added}`);
  }

  let dataUpdateString = `Starbase - Data Update:\n${changeString.join('\n')}`;
  distribute(dataUpdateString);
});

starbaseIO.on('updateClosure', async (data) => {
  logger.log('Closure Update');
  let regex = /(\w+,?\s)?(\w+)\s(\d+),\s(\d+)/;
  let match = data.new.date.match(regex);
  let date = moment(`${match[2]} ${match[3]}, ${match[4]}`, 'MMM D, YYYY');
  let dateString = date.format('M/D/YYYY');
  let testingDiff = objectdiff.diff(data.old, data.new);
  let changes = {};
  await diffValueHandler(testingDiff, null, changes);

  let changeString = [];

  for (const key in changes) {
    const difference = changes[key];
    changeString.push(`${keys[key]}: ${difference.removed} => ${difference.added}`);
  }

  let closureUpdateString = `Starbase - ${dateString} Closure Update:\n${changeString.join('\n')}`;
  distribute(closureUpdateString);
});

// Handles nested differences in values
function diffValueHandler(diff, name, changes) {
  if (diff.changed === 'object change') {
    for (const key in diff.value) {
      diffValueHandler(diff.value[key], key, changes);
    }
  } else if (diff.changed === 'primitive change') {
    changes[name] = diff;
  }
}

function timingDiffHandler(diff, name, changes) {
  if (diff.changed === 'object change') {
    for (const eventKey in diff.value) {
      let event = diff.value[eventKey];
      for (const timeKey in event.value) {
        let time = event.value[timeKey];
        if (time.changed === 'primitive change') {
          // First letter of timeKey to uppercase
          let key = timeKey.charAt(0).toUpperCase() + timeKey.slice(1);
          let changeName = `${eventKey}${key}`;
          changes[changeName] = time;
        }
      }
    }
  } else if (diff.changed === 'primitive change') {
    changes[name] = diff;
  }
}

// Fires when a socket error occurs
starbaseIO.on('connect_error', (err) => {
  logger.error(err);
});

// every week on Sunday at 9pm
cron.schedule('0 21 * * Sun', async () => {
  let fetch = require('./nfetch').nfetch;
  logger.log('McGregor Update');
  let data = await fetch(`https://${process.env.mcgregor_host}/api/json/testing`).then((res) => res.json());
  // find tests in data that are from the past week
  let tests = data.filter((test) => {
    let testDate = moment(test.date);
    let weekAgo = moment().subtract(7, 'days');
    return testDate.isAfter(weekAgo);
  });

  let stands = [];
  let totalDuration = 0;

  for (const test of tests) {
    if (stands.includes(test.stand)) {
      continue;
    } else {
      stands.push(test.stand);
    }
    if (test.duration >= 0) {
      totalDuration += parseInt(test.duration);
    }
  }

  let string = `McGregor - Weekly Update:\nThere were ${tests.length} tests over this past week.\n${stands.length} different stands fired for a total of ${totalDuration} seconds.\n\nPowered by @NASASpaceFlight's McGregor Live\nhttps://nsf.live/c/mcgregor`;
  distribute(string);
}, {
  scheduled: true,
  timezone: 'America/Chicago',
});

function distribute(string) {
  mastodonClient.postStatus(string);
  rwClient.v2.tweet(string).catch((err) => {
    logger.error(err);
  });
}
