const chalk = require('chalk');

const log = console.log;

let isShowingDebugLogs = false;

const setDebugLogs = (param) => {
  isShowingDebugLogs = param;
};

const debug = (userLog) => {
  if (!isShowingDebugLogs) {
    return;
  }

  log(chalk.inverse('[DEBUG]') + ` ${userLog}`);
};

const info = (userLog) => {
  log(userLog);
};

const success = (userLog) => {
  log(chalk.green(userLog));
};

const failure = (userLog) => {
  log(chalk.red(userLog));
};

module.exports = { setDebugLogs, debug, info, success, failure };
