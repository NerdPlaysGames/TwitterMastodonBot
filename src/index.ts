import path from 'path';
import dotenv from 'dotenv';
import CatLoggr from 'cat-loggr/ts';
import moment from 'moment';
import { schedule } from 'node-cron';

let dotenvPath = path.join(process.cwd(), '.env');
if (path.parse(process.cwd()).name === 'dist') dotenvPath = path.join(process.cwd(), '..', '.env');

dotenv.config({ path: dotenvPath });
const logger = new CatLoggr().setLevel(process.env.COMMANDS_DEBUG === 'true' ? 'debug' : 'info');

import { postToAll } from './utils/Socials';
import SocketClient from './utils/Socket';

const socket = new SocketClient(logger);

schedule('0 21 * * Sun', (async () => {
  const data = await fetch(`https://${process.env.mcgregor_host}/api/json/testing`).then(res => res.json()) as Test[];
  const tests = data.filter((test) => {
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
      totalDuration += test.duration;
    }
  }

  const string = `McGregor - Weekly Update:\nThere were ${tests.length} tests over this past week.\n${stands.length} different stands fired for a total of ${totalDuration} seconds.\n\nPowered by @NASASpaceFlight's McGregor Live\nhttps://nsf.live/c/mcgregor`;
  postToAll(string);
}));

interface Test {
    date: string;
    duration: number;
    end_date: string;
    engine: string;
    stand: string;
    id: string;   
}

export { logger, socket };