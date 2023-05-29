import { lodash as _, Logger, fs } from '@serverless-cd/core';
import { spawnSync } from 'child_process';

export interface IProps {
  objectKey: string;
  region: string;
  bucket: string;
  prefix: string;
  cachePath: string;
  credentials: ICredentials;
  internal?: boolean;
  cwd?: string;
}

export interface ICredentials {
  accountId: string;
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
}

export default class Cache {
  // -j 多文件操作时的并发任务数，默认值为3，取值范围为1~10000
  // --bigfile-threshold  开启大文件断点续传的文件大小阈值，单位为Byte，默认值为100 MByte，取值范围为 0~9223372036854775807。
  static readonly cpCommonParams = ['-r', '-f', '-j 50', '--bigfile-threshold 9223372036854775800'];
  private logger: Logger;
  private cachePath: string;
  private cloudUrl: string;
  private commonSuffix: string;
  private error?: Error;
  private cwd: string | undefined;
  private createBucketName?: string;

  constructor(props: IProps, logger: Logger) {
    this.logger = (logger || console) as Logger;
    const commonSuffix = [];
    const errorMessage = [];

    const internal = _.get(props, 'internal') === true ? true : false; // 默认为 false
    const region = _.get(props, 'region', '');
    this.logger.debug(`region: ${region}`);
    if (_.isEmpty(region)) {
      errorMessage.push('Region does not meet expectations');
    }
    commonSuffix.push(`-e oss-${region}${internal ? '-internal' : ''}.aliyuncs.com`);

    const { accountId, accessKeyId, accessKeySecret, securityToken } = _.get(props, 'credentials', {} as ICredentials);
    if (_.isEmpty(accessKeyId) || _.isEmpty(accessKeySecret)) {
      errorMessage.push('Credentials does not meet expectations');
    }
    commonSuffix.push(`-i ${accessKeyId}`);
    commonSuffix.push(`-k ${accessKeySecret}`);
    if (securityToken) {
      commonSuffix.push(`-t ${securityToken}`);
    }
    
    let bucket = _.get(props, 'bucket', '');
    if (_.isEmpty(bucket)) {
      bucket = `serverless-cd-${region}-cache-${accountId}`;
      this.createBucketName = bucket;
    }
    const objectKey = _.get(props, 'objectKey', '');
    if (_.isEmpty(objectKey)) {
      errorMessage.push('Key does not meet expectations');
    }
    const prefix = _.get(props, 'prefix', 'cache-home');
    // this.cloudUrl = `oss://${bucket}/${prefix ? `${prefix}/` : ''}${objectKey}${_.endsWith(objectKey, '/') ? '' : '/'}`;
    this.cloudUrl = this.getCloudUrl(bucket, objectKey, prefix);
    this.logger.debug(`cloudUrl: ${this.cloudUrl}`);
    this.cachePath = _.get(props, 'cachePath', '');
    this.logger.debug(`cachePath: ${this.cachePath}`);
    if (_.isEmpty(this.cachePath)) {
      errorMessage.push('Path does not meet expectations');
    }
    this.commonSuffix = commonSuffix.join(' ');

    if (!_.isEmpty(errorMessage)) {
      const message = errorMessage.join('\n');
      logger.debug(`New cache error: ${errorMessage}`);
      this.error = new Error(message);
    }
    this.cwd = _.get(props, 'cwd');
    logger.debug(`this.cwd: ${this.cwd}`);
    if (this.cwd) {
      fs.ensureDirSync(this.cwd);
    }
  }

  private getCloudUrl(bucket: string, objectKey: string, prefix?: string): string {
    let url = `oss://${bucket}/`;
    if (prefix) {
      url += `${prefix}/`;
    }
    url += objectKey;
    if (!_.endsWith(objectKey, '/')) {
      url += '/';
    }
    return url;
  }

  run(): { 'cache-hit': boolean, error?: Error } {
    if (this.error) {
      return { 'cache-hit': false, error: this.error };
    }
    if (this.createBucketName) {
      this.logger.debug(`Checking bucket exists: ossutil stat oss://${this.createBucketName}; stdout:`);
      const { stdout } = spawnSync(`ossutil stat oss://${this.createBucketName} ${this.commonSuffix}`, {
        timeout: 10000,
        encoding: 'utf8',
        shell: true,
      });
      this.logger.debug(stdout);

      if (_.includes(stdout, 'Error:')) {
      // if (_.includes(stdout, 'StatusCode=404')) { // 仅404
        this.logger.debug(`retry create bucket: ossutil mb oss://${this.createBucketName}; stdout:`);
        const { stdout } = spawnSync(`ossutil mb oss://${this.createBucketName} ${this.commonSuffix}`, {
          timeout: 10000,
          encoding: 'utf8',
          shell: true,
        });
        this.logger.debug(stdout);
      }
    }
    // @ts-ignore
    const { stdout, status } = spawnSync(`ossutil du ${this.cloudUrl} ${this.commonSuffix}`, {
      timeout: 10000,
      encoding: 'utf8',
      shell: true,
    });
    this.logger.debug(`ossutild du response.status: ${status}; stdout:\n`);
    this.logger.debug(stdout);
    if (status === null || status !== 0) {
      this.error = new Error(`ossutil du error`);
      this.logger.error(`ossutil du error`);
      return { 'cache-hit': false, error: this.error };
    }

    if (!_.includes(stdout, 'total object count: 0')) {
      this.logger.debug('cache-hit: true');
      fs.ensureDirSync(this.cachePath);

      const cpResponse = spawnSync(`ossutil cp ${this.cloudUrl} ${this.cachePath} ${Cache.cpCommonParams.join(' ')} ${this.commonSuffix}`, {
        encoding: 'utf8',
        shell: true,
        cwd: this.cwd,
      });
  
      if (cpResponse.error) {
        this.logger.error(`ossutild cp ${cpResponse.error}`);
        return { 'cache-hit': false, error: cpResponse.error };
      }

      this.logger.debug(`ossutild cp response.status: ${cpResponse.status}; stdout:\n`);
      this.logger.debug(cpResponse.stdout);
      return { 'cache-hit': true };
    }
    this.logger.debug('cache-hit: false');
    return { 'cache-hit': false, error: this.error };
  }

  postRun(cacheHit: boolean, cacheError: any): void {
    this.logger.debug(`Cache preRun error: ${cacheError ? cacheError : false}`);
    this.logger.debug(`Cache already exists: ${cacheHit ? cacheHit : false}`);

    this.logger.info('Start push');
    fs.ensureDirSync(this.cachePath);

    const cpResponse = spawnSync(`pwd && ossutil cp ${this.cachePath} ${this.cloudUrl} ${Cache.cpCommonParams.join(' ')} ${this.commonSuffix}`, {
      encoding: 'utf8',
      shell: true,
      cwd: this.cwd,
    });
    if (cpResponse.error) {
      this.logger.error(`ossutild cp ${cpResponse.error}`);
      return;
    }
    this.logger.debug(`ossutild cp response.status: ${cpResponse.status}; stdout:\n`);
    this.logger.debug(cpResponse.stdout);
  }
}
