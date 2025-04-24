import path from 'node:path';
import { appendFile, writeFile, existsSync } from 'node:fs';

const resourcesPath =
  process.env.NODE_ENV === 'development'
    ? (process.env.PWD ?? '')
    : process.resourcesPath;

const noop = () => null;

const LogLevelMap = {
  info: {
    path: path.resolve(resourcesPath, 'info.log'),
  },
  warn: {
    path: path.resolve(resourcesPath, 'warn.log'),
  },
  error: {
    path: path.resolve(resourcesPath, 'error.log'),
  },
};

export class Logger {
  static doLog(level: keyof typeof LogLevelMap, message: string) {
    const fullMessage = `${new Date().toISOString()} ${message}\n`;
    if (LogLevelMap[level]) {
      if (existsSync(LogLevelMap[level].path)) {
        appendFile(LogLevelMap[level].path, fullMessage, noop);
      } else {
        writeFile(LogLevelMap[level].path, fullMessage, noop);
      }
    }
  }

  static info(message: string) {
    this.doLog('info', message);
  }

  static warn(message: string) {
    this.doLog('warn', message);
  }

  static error(message: string) {
    this.doLog('error', message);
  }
}
