#!/usr/bin/env node

const yargs = require('yargs');
const inquirer = require('inquirer');
const fs = require('fs');
const { setDebugLogs, debug, info, success, failure } = require('./logger');

const doCommand = async () => {
  try {
    const options = yargs
      .usage(
        'Usage: $0 -h <hostname> -t <token> -u <username> -p <password> -f <path> -o <output> -d --override'
      )
      .options({
        h: {
          alias: 'hostname',
          describe: 'Host of Vault server',
          type: 'string',
          demandOption: true,
        },
        t: {
          alias: 'token',
          describe: 'Auth token',
          type: 'string',
        },
        u: {
          alias: 'username',
          describe: 'Auth username',
          type: 'string',
        },
        p: {
          alias: 'password',
          describe: 'Auth password',
          type: 'string',
        },
        f: {
          alias: 'path',
          describe: 'Path to secrets',
          type: 'string',
          demandOption: true,
        },
        o: {
          alias: 'output',
          describe: 'Name of output file',
          type: 'string',
          demandOption: true,
        },
        d: {
          alias: 'debug',
          describe: 'Show debug logs',
        },
        override: {
          describe: 'Override file if found',
        },
      }).argv;

    if (options.debug) {
      setDebugLogs(true);
    }

    let userOptions = {
      ...options,
    };

    if (!options.token && !options.username) {
      try {
        const { authType } = await inquirer.prompt([
          {
            type: 'list',
            name: 'authType',
            message: 'Please select your authentication method',
            choices: [
              {
                name: 'Token',
                value: 'token',
              },
              { name: 'Username/password', value: 'userpass' },
            ],
          },
        ]);

        if (authType === 'token') {
          const { token: inputToken } = await inquirer.prompt([
            {
              type: 'input',
              name: 'token',
              message: 'Please input your auth token used to sign in to Vault',
            },
          ]);

          userOptions = {
            ...userOptions,
            token: inputToken,
          };
        } else if (authType === 'userpass') {
          const {
            username: inputUsername,
            password: inputPassword,
          } = await inquirer.prompt([
            {
              type: 'input',
              name: 'username',
              message: 'Please input your username',
            },
            {
              type: 'password',
              name: 'password',
              message: 'Please input your password',
            },
          ]);

          userOptions = {
            ...userOptions,
            username: inputUsername,
            password: inputPassword,
          };
        }
      } catch (err) {
        console.log('Error', err);
      }
    }

    const {
      hostname,
      path,
      output,
      token,
      username,
      password,
      override,
    } = userOptions;

    const vault = require('node-vault')({
      apiVersion: 'v1',
      endpoint: hostname,
      token,
    });

    let tempToken = null;
    if (!token) {
      debug('Auth token not specified');
      debug('Using user/pass method to login to Vault');
      const res = await vault.userpassLogin({
        username,
        password,
      });

      if (res.auth) {
        ({
          auth: { client_token: tempToken },
        } = res);
      }
    }

    debug('Modifying Vault path to fit requirements of Vault KV v2 API..');

    const modifiedPathForAPI = path
      .split('/')
      .reduce((accumulator, currentValue, index) => {
        if (index === 1) {
          return `${accumulator}/data/${currentValue}`;
        }

        return `${accumulator}/${currentValue}`;
      });

    debug('Successfully modified Vault path!');

    debug('Connecting to Vault server..');
    debug('Reading environment variables from Vault...');

    const resEnv = await vault.read(modifiedPathForAPI);

    if (resEnv.data && resEnv.data.data) {
      const {
        data: { data: environmentVariables },
      } = resEnv;
      // console.log(environmentVariables);

      debug('Environment variables obtained successfully from Vault');
      info('Checking if file already exists..');
      const isFileExist = fs.existsSync(output);

      if (isFileExist && !override) {
        info('File already exists in current directory');
        if (!override) {
          const { toOverrideFile } = await inquirer.prompt([
            {
              type: 'list',
              name: 'toOverrideFile',
              message: 'Do you want to override the file?',
              choices: [
                {
                  name: 'Yes',
                  value: 'y',
                },
                { name: 'No', value: 'n' },
              ],
            },
          ]);

          if (toOverrideFile === 'n') {
            throw new Error('Program aborted');
          }
        }
        info('Overriding file with latest contents from Value');
      }

      debug(
        'Translating environment variables from JSON to readable .env format..'
      );

      let stringEnvs = '';
      Object.keys(environmentVariables).map((key) => {
        stringEnvs = `${stringEnvs}${key}=${environmentVariables[key]}\n`;
      });

      debug('Translation successful!');

      debug('Writing contents to file now..');
      fs.writeFileSync(output, stringEnvs);
      debug('File written successfully');
    }

    if (tempToken) {
      debug('Cleaning up.. removing temp Vault auth tokens');
      await vault.tokenRevokeSelf({
        token: tempToken,
      });
    }

    success('Command finished running successfully.');
  } catch (err) {
    failure('An error has occurred!');
    failure(err || err.message);
  }
};

doCommand();
