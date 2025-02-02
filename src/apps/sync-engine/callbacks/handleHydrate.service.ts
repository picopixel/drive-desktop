import Logger from 'electron-log';
import * as Sentry from '@sentry/electron/renderer';
import { QueueItem, VirtualDrive } from 'virtual-drive/dist';

type TProps = {
  drive: VirtualDrive;
  task: QueueItem;
};

export class HandleHydrateService {
  async run({ drive, task }: TProps) {
    try {
      await drive.hydrateFile(task.path);
    } catch (error) {
      Logger.error(`Error hydrating file ${task.path}`);
      Logger.error(error);
      Sentry.captureException(error);
    }
  }
}
