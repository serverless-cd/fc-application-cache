import path from 'path';
import fs from 'fs';
import Engine from '@serverless-cd/engine';

require('dotenv').config({ path: path.join(__dirname, '.env') });

const logPrefix = path.join(__dirname, 'logs');
const plugin = path.join(__dirname, '..', 'src'); // "@serverless-cd/cache"
const currentRegion = 'cn-qingdao';
const region = 'cn-hongkong';
const sts = {
  accountId: process.env.accountId,
  accessKeyId: process.env.accessKeyId,
  accessKeySecret: process.env.accessKeySecret,
  // securityToken: '',
};

function removeDir(dir: string) {
  let files = fs.readdirSync(dir);
  for (var i = 0; i < files.length; i++) {
    let newPath = path.join(dir, files[i]);
    let stat = fs.statSync(newPath);
    if (stat.isDirectory()) {
      //如果是文件夹就递归下去
      removeDir(newPath);
    } else {
      fs.unlinkSync(newPath); //删除文件
    }
  }
  fs.rmdirSync(dir); //如果文件夹是空的，就将自己删除掉
}

beforeAll(() => {
  try {
    removeDir(logPrefix);
  } catch (err) { }
});

test('全部参数', async () => {
  const steps = [
    {
      plugin: plugin,
      id: 'my-cache',
      inputs: {
        key: 'objectKey',
        path: path.join(__dirname, 'fixtures'),
      }
    },
  ];
  const engine = new Engine({
    cwd: __dirname,
    steps,
    logConfig: { 
      logPrefix: path.join(logPrefix, 'p-1'),
      logLevel: 'DEBUG',
    },
    inputs: {
      sts,
      uid: process.env.accountId,
      currentRegion,
      ctx: {
        data: {
          cacheConfig: {
            oss: {
              regionId: region,
              bucketName: 'serverless-cd-cn-hongkong-cache-1740298130743624',
              prefix: 'add-prefix',
            }
          }
        }
      }
    },
  });
  await engine.start();
});

test('不传递 oss 参数', async () => {
  const steps = [
    {
      plugin: plugin,
      id: 'my-cache',
      inputs: {
        key: 'objectKey',
        path: path.join(__dirname, 'fixtures'),
      }
    },
  ];
  const engine = new Engine({
    cwd: __dirname,
    steps,
    logConfig: { 
      logPrefix: path.join(logPrefix, 'p-2'),
      logLevel: 'DEBUG',
    },
    inputs: {
      sts,
      uid: process.env.accountId,
      currentRegion: region,
    },
  });
  await engine.start();
});

test.only('cwd 目录不存在', async () => {
  const steps = [
    {
      plugin: plugin,
      id: 'my-cache',
      inputs: {
        key: 'objectKey',
        path: path.join(__dirname, 'fixtures'),
      }
    },
  ];
  const engine = new Engine({
    cwd: path.join(__dirname, 'abc'),
    steps,
    logConfig: { 
      logPrefix: path.join(logPrefix, 'p-3'),
      logLevel: 'DEBUG',
    },
    inputs: {
      sts,
      uid: process.env.accountId,
      currentRegion: region,
    },
  });
  await engine.start();
});
