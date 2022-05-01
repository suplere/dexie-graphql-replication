import {
  HasuraStorageClient,
  StorageUploadResponse,
} from "@suplere/hbp-storage-js";
import {
  MODEL_METADATA_KEY,
  uploadQueueModel,
} from "../metadata/MetadataModels";
import { NetworkStatusEvent } from "../network/NetworkStatus";
import { CRUDEvents } from "../utils/CRUDEvents";
import { AttachmentReplicatorConfig, UploadRequest } from "./types";

export class AttachmentReplicator {
  private config: AttachmentReplicatorConfig;
  private s3PathField!: string;
  private s3UploadedPath!: string;
  private s3AttachmentDataField!: string;
  private s3Client: HasuraStorageClient;
  private processing: boolean;
  private replicating: boolean;
  private open?: boolean;

  constructor(config: AttachmentReplicatorConfig) {
    this.config = config;
    this.s3PathField = config.attachmentConfig.uploadedPathField;
    this.s3UploadedPath = config.attachmentConfig.dataPathField;
    this.s3AttachmentDataField = config.attachmentConfig.dataField;
    this.s3Client = config.s3Client;
    this.processing = false;
    this.replicating = false;

    this.config.networkIndicator.subscribe({
      next: (message: NetworkStatusEvent) => {
        console.log(`Network state changed: ${message}`);
        this.open = message.isOnline;
        if (this.open) {
          this.processUpload();
        }
      },
      complete: () => {
        this.open = false;
      },
      error: () => {},
    });

    // Intentionally async to start replication in background
    this.config.networkIndicator.isNetworkReachable().then((result) => {
      if (this.open === undefined) {
        // first time
        this.open = result;
      } else if (this.open === result) {
        // No state change
        return;
      }

      if (result === true) {
        // Going online
        this.processUpload();
      }
      this.open = result;
    });
  }

  public getS3DataField() {
    return this.s3AttachmentDataField;
  }

  public getS3PathField() {
    return this.s3PathField;
  }

  /**
   * Save user change to bereplicated by engine
   */
  public async saveChangeForReplication(data: any, eventType: CRUDEvents) {
    const uploadedAttachment = data[this.s3AttachmentDataField];
    const uploadedS3Path = data[this.s3PathField];
    // console.log('SAVE FOR UPLOAD', uploadedAttachment, uploadedS3Path)
    if (uploadedAttachment && uploadedS3Path) {
      // const storeName = this.config.model.getStoreName()
      // const saveData = removeUnderscore(data)
      const uploadRequest: UploadRequest = {
        data,
        uploadData: {
          data: uploadedAttachment,
          metadata: null,
          onUploadProgress: undefined,
          type: "data_url",
          path: uploadedS3Path,
        },
        eventType,
      };
      // console.log('UPLOAD REQUEST', uploadRequest)
      await this.enqueueRequest(uploadRequest);

      this.processUpload();
    }
  }

  public async processUpload() {
    // console.log('process')
    if (!this.open) {
      // console.log('Client offline. Stop processsing queue')
      return;
    }

    if (this.processing) {
      // console.log('Client is processing already. Stop processsing queue')
      return;
    }

    this.processing = true;
    // console.log("OPEN, REPLICATING", this.open, this.replicating)
    while (this.open && this.replicating) {
      const storedUploads = await this.getStoredUploads();
      if (!storedUploads) {
        // console.log('Mutation Queue is empty - nothing to replicate')
        break;
      }

      const item: UploadRequest = storedUploads[0];
      // console.log('Mutation queue processing - online')

      try {
        const result = await this.s3Client.uploadStringToStorage(
          item.uploadData
        );
        if (result) {
          // console.log('RESULT MUTATION', result)
          await this.resultProcessor(item, result);
          await this.dequeueRequest();
          // console.log('Mutation dequeued')
        }
      } catch (error) {
        console.error(error);
      }
    }
    this.processing = false;
    // console.log('END Process')
  }

  /**
   * Helper method to flag that replication and start
   * processing the mutation queue.
   *
   */
  public startReplication() {
    this.replicating = true;
    this.processUpload();
  }

  /**
   * Helper method to stop replication and stop the
   * processing of the mutation queue.
   */
  public stopReplication() {
    this.replicating = false;
  }

  private async resultProcessor(
    item: UploadRequest,
    uploadResult: StorageUploadResponse
  ) {
    // console.log('UPLOAD REQUEST', item)
    // console.log('UPLOAD RESULT ', uploadResult)

    if (uploadResult.fileMetadata) {
      const pKey = this.config.model.schema.getPrimaryKey();
      const dataResult: any = {
        ...item.data,
        [this.s3UploadedPath]: uploadResult.fileMetadata?.key,
        [this.s3PathField]: "",
        [this.s3AttachmentDataField]: "",
        [pKey]: item.data[pKey],
      };

      await this.config.model.processAttachmentChanges(dataResult);
    }
  }

  private async dequeueRequest() {
    // console.log('Removing request from the queue')
    const items = await this.getStoredUploads();
    if (items && items instanceof Array) {
      items.shift();
      const tableName = uploadQueueModel.getStoreName();
      const storeName = this.config.model.schema.getStoreName();
      await this.config.db?.table(tableName).put({
        [MODEL_METADATA_KEY]: storeName,
        items,
      });
      // invariant(saved, 'Store should be saved after mutation is rejected')
    } else {
      // logger('Should not happen')
    }
  }

  private async enqueueRequest(uploadRequest: UploadRequest) {
    // console.log('enqueueRequest')
    let items = await this.getStoredUploads();
    if (items && items instanceof Array) {
      items.push(uploadRequest);
    } else {
      items = [uploadRequest];
    }
    const tableName = uploadQueueModel.getStoreName();
    const storeName = this.config.model.schema.getStoreName();
    await this.config.db.table(tableName).put({
      [MODEL_METADATA_KEY]: storeName,
      items,
    });
  }

  private async getStoredUploads() {
    const tableName = uploadQueueModel.getStoreName();
    const storeName = this.config.model.schema.getStoreName();
    const data = await this.config.db?.table(tableName).get(storeName);
    if (data) {
      if (data.items.length !== 0) {
        return data.items;
      }
    }
  }
}
