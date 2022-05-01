import { ApplicationDexie } from "../DataStore";
import { AttachmentSchemaProperties } from "../ModelSchema";
import { CRUDEvents } from "../utils/CRUDEvents";
import { AttachmentReplicator } from "./AttachmentReplicator";
import { PullReplicator } from "./PullReplicator";
import { PushReplicator } from "./PushReplicator";
import { SubscriptionReplicator } from "./SubscriptionReplicator";
import { ModelReplicatorConfig } from "./types";

export class ModelReplicator {
  private pullReplicator: PullReplicator;
  private pushReplicator: PushReplicator;
  private subscriptionReplicator: SubscriptionReplicator;
  private config: ModelReplicatorConfig;
  private attachmentReplicators: Record<string, AttachmentReplicator> = {};

  constructor(config: ModelReplicatorConfig) {
    this.config = config;

    this.pullReplicator = new PullReplicator({
      db: this.config.db,
      deletedField: this.config.model.schema.getDeleteField(),
      networkIndicator: this.config.networkIndicator,
      model: this.config.model,
      client: this.config.client,
      pullInterval: 1000 * 60 * 10,
    });

    this.pushReplicator = new PushReplicator({
      db: this.config.db,
      deletedField: this.config.model.schema.getDeleteField(),
      networkIndicator: this.config.networkIndicator,
      client: this.config.client,
      model: this.config.model,
    });

    this.subscriptionReplicator = new SubscriptionReplicator({
      authStatus: this.config.authStatus,
      client: this.config.client,
      db: this.config.db,
      model: this.config.model,
      networkIndicator: this.config.networkIndicator,
      subsUrl: this.config.subsUrl,
    });

    const attachments = this.config.model.schema.getAttachments();
    attachments.forEach((nameAttachment) => {
      // attachment replicator create
      if (!this.config.s3Client)
        throw "S3Clent does not provide for attachment handling";
      this.attachmentReplicators[nameAttachment] = new AttachmentReplicator({
        db: this.config.db as ApplicationDexie,
        name: nameAttachment,
        s3Client: this.config.s3Client,
        model: this.config.model,
        networkIndicator: this.config.networkIndicator,
        attachmentConfig: this.config.model.schema.getAttachmentsConfig(
          nameAttachment
        ) as AttachmentSchemaProperties,
      });
    });
  }

  public startPullReplication() {
    this.pullReplicator.start();
  }

  public stopPullReplication() {
    this.pullReplicator.stop();
  }

  public startPushReplication() {
    this.pushReplicator.startReplication();
  }

  public stopPushReplication() {
    this.pushReplicator.stopReplication();
  }

  public startWSReplication() {
    this.subscriptionReplicator.startWSSubscription();
  }

  public stoptWSReplication() {
    this.subscriptionReplicator.stopWSSubscription();
  }

  public startAttachmentsReplicators() {
    Object.keys(this.attachmentReplicators).forEach((name) => {
      this.attachmentReplicators[name].startReplication();
    });
  }

  public stopAttachmentsReplicators() {
    Object.keys(this.attachmentReplicators).forEach((name) => {
      this.attachmentReplicators[name].stopReplication();
    });
  }

  public runPerform() {
    this.pullReplicator.perform();
  }

  public saveChangeForReplication(data: any, eventType: CRUDEvents) {
    this.pushReplicator.saveChangeForReplication(data, eventType);
  }

  public saveChangeForUploadReplication(data: any, eventType: CRUDEvents) {
    // console.log('IN UPLOAD REPLICATION', data)
    Object.keys(this.attachmentReplicators).forEach((name) => {
      const uploadReplicator = this.attachmentReplicators[name];
      const uploadData = data[uploadReplicator.getS3DataField()];
      const s3PathField = data[uploadReplicator.getS3PathField()];
      // console.log('UPLOAD DATA, PATH', uploadData, s3PathField)
      if (uploadData && s3PathField) {
        uploadReplicator.saveChangeForReplication(data, eventType);
      }
    });

    // const uploadReplicators = this.pushReplicator.saveChangeForReplication(data, eventType)
  }

  public canRead(): boolean {
    const modelPermissions = this.config.model.schema.getPermissions();
    const currentUserRoles = this.config.authStatus.roles();
    // console.log(
    //   `${this.config.model.getName()} - CAN READ FUNC`,
    //   modelPermissions,
    //   currentUserRoles
    // )
    return modelPermissions.read.some((role) =>
      currentUserRoles.includes(role)
    );
  }

  public canWrite(): boolean {
    const modelPermissions = this.config.model.schema.getPermissions();
    const currentUserRoles = this.config.authStatus.roles();
    return modelPermissions.write.some((role) =>
      currentUserRoles.includes(role)
    );
  }

  public canDelete(): boolean {
    const modelPermissions = this.config.model.schema.getPermissions();
    const currentUserRoles = this.config.authStatus.roles();
    // console.log(`${this.config.model.getName()} modelPermissions`, modelPermissions)
    // console.log(`${this.config.model.getName()} currentUserRoles`, currentUserRoles)
    return modelPermissions.delete.some((role) =>
      currentUserRoles.includes(role)
    );
  }
}
