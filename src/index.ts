import path from 'path';
import dotenv from 'dotenv';

let dotenvPath = path.join(process.cwd(), '.env');
if (path.parse(process.cwd()).name === 'dist') dotenvPath = path.join(process.cwd(), '..', '.env');

dotenv.config({ path: dotenvPath });

import SocketClient from './utils/Socket';

import CatLoggr from 'cat-loggr/ts';

const logger = new CatLoggr().setLevel(process.env.COMMANDS_DEBUG === 'true' ? 'debug' : 'info');

const socket = new SocketClient(logger);

export { logger, socket };
