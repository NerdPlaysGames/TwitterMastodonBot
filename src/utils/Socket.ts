import { io, Socket } from 'socket.io-client';
import CatLoggr from 'cat-loggr/ts';
import moment from 'moment';
import { image } from 'image-downloader';
import { postToAll } from './Socials';
import { fields } from './Fields';
import { diff } from './ObjectDiff';
// eslint-disable-next-line @typescript-eslint/no-unused-vars

export default class SocketClient {
  public socket: Socket;

  private logger: CatLoggr;

  constructor(logger: CatLoggr) {
    this.logger = logger;
    this.socket = io(process.env.starbaseDashURL);

    this.socket.on('roadClosuresChanges', async (data: ClosureChanges[]) => {
      // eslint-disable-next-line prefer-const
      let changes = [];
      for (let i = 0; i < data.length; i++) {
        const change = data[i];

        if (change.type === 'new') {
          logger.info(`New closure: ${change.closure.date}`);
          const start = moment(change.closure.timestamps.start, 'X');
          changes.push(
            `🆕 ${start.format('MMM')}. ${start.format('D')}, ${cleanString(change.closure.status)}, ${
              change.closure.time
            }`
          );
        } else if (change.type === 'update') {
          const start = moment(change.new.timestamps.start, 'X');

          for (let i = 0; i < change.changes.length; i++) {
            const changed = change.changes[i];
            changes.push(
              `🔄 ${start.format('MMM')}. ${start.format('D')}, ${fields[changed.field]}: ${cleanString(
                changed.old
              )} -> ${cleanString(changed.new)}`
            );
          }
          this.logger.info(`Updated closure: ${change.new.date}`);
        }
      }

      const string = `Starbase - Road Closure Update:\n${changes.join('\n')}`;
      postToAll(string);
    });

    this.socket.on('newNOTAM', async (data: NOTAM) => {
      const tfrString = `Starbase - New TFR (${data.tfrID})\n${data.dateStart} to ${data.dateEnd}\n${data.lowerAltitude}${data.units} - ${data.upperAltitude}${data.units}`;
      // fetch image https://tfr.faa.gov/save_maps/sect_${tfrID}.gif
      const tfrID2 = data.tfrID.replace('/', '_');
      const imageURL = `https://tfr.faa.gov/save_maps/sect_${tfrID2}.gif`;

      await image({
        'dest': '../../tfr.gif',
        'url': imageURL
      })

      await postToAll(tfrString, './tfr.gif');
    });

    this.socket.on('dataUpdatePub', async (data: DataUpdate) => {
      const testingDiff = diff(data.old.testing, data.new.testing);
      let changes = {};
      await diffValueHandler(testingDiff, null, changes);

      let timingDiff = diff(data.old.timing, data.new.timing);
      await timingDiffHandler(timingDiff, null, changes);

      let changeString = [];

      for (const key in changes) {
        const difference = changes[key];
        changeString.push(`${fields[key]}: ${difference.removed} => ${difference.added}`);
      }

      const dataUpdateString = `Starbase - Data Update:\n${changeString.join('\n')}`;
      postToAll(dataUpdateString);
    })

    this.socket.on('textmessages', async (data: string) => {

    });

    this.socket.on('connect', () => {
      this.logger.info('Connected to Starbase host.');
    });
  }
}

interface Data {
  testing: Testing;
  timing: Timing[];
}

interface DataUpdate {
  old: Data;
  new: Data;
}

interface Testing {
  expected: string;
  spXconf: string;
  stateOfRoad: string;
  noticeMariner: string;
  overPressure: string;
  villageEvac: string;
  stateOfLS: string;
}

interface Timing {
  predicted: string;
  actual: string;
  name: string;
}

interface NOTAM {
  dateEnd: string;
  dateStart: string;
  link: string;
  lowerAltitude: string;
  tfrID: string;
  units: string;
  upperAltitude: string;
}

interface ClosureChanges {
  id: string;
  type: 'new' | 'update';
  closure?: Closure;
  new?: Closure;
  old?: Closure;
  changes?: Changes[];
}

interface Changes {
  field: string;
  old: any;
  new: any;
}

interface Closure {
  id: string;
  type: string;
  date: string;
  time: string;
  status: string;
  timestamps: {
    start: number;
    end: number;
  };
}

function cleanString(string) {
  let newString = string.replace('Closure', '');
  // capture groups: Scheduled, Concluded, Complete, Possible, Canceled, Revoked
  const regex = /\b(Scheduled|Concluded|Complete|Possible|Canceled|Revoked)\b/g;
  if (regex.test(newString)) {
    newString = newString.match(regex)[0];
  }
  
  return newString.trim();
}

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