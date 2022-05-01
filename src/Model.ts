import { uid } from "quasar";
import { ApplicationDexie } from "./DataStore";
import { ModelReplicator } from "./GraphQLReplication/ModelReplicator";
import { ModelReplicatorConfig } from "./GraphQLReplication/types";
import { metadataModel } from "./metadata/MetadataModels";
import { ModelSchema } from "./ModelSchema";
import { Filter } from "./types";
import { CRUDEvents } from "./utils/CRUDEvents";
import { ObservablePushStream, PushStream } from "./utils/PushStream";
import { StoreChangeEvent } from "./utils/StoreChangeEvent";

/**
 * Options that describe model field
 */
export interface FieldOptions {
  /** GraphQL type */
  type: string;
  /** GraphQL key */
  key: string;
  format?: {};
}

// const CLIENT_ID_PREFIX = 'storeclient.'

/**
 * Defines the properties expected in the Fields object for a model
 */
export type Fields<T> = {
  [P in keyof T]: FieldOptions;
};

/**
 * Model Config options
 */
export interface ModelConfig<T = unknown> {
  /**
   * Model name
   */
  name: string;

  /**
   * Model store name, defualts to `user_${name}`
   */
  storeName?: string;

  /**
   * Model fields
   */
  fields: Fields<T>;
}

/**
 * Provides CRUD capabilities for a model
 */
export class Model<T = unknown> {
  public schema: ModelSchema<T>;
  public replicationConfig: ModelReplicatorConfig | undefined;
  // public replication?: ModelChangeReplication
  public changeEventStream: PushStream<StoreChangeEvent>;
  private replicator?: ModelReplicator;
  private db: ApplicationDexie;

  constructor(
    schema: ModelSchema<T>,
    db: ApplicationDexie,
    replicationConfig?: ModelReplicatorConfig
  ) {
    this.db = db;
    this.changeEventStream = new ObservablePushStream();
    this.schema = schema;
    this.replicationConfig = replicationConfig;
    // this.testObserve()
  }

  public getFields() {
    return this.schema.getFields();
  }

  public getName() {
    return this.schema.getName();
  }

  public getStoreName() {
    return this.schema.getStoreName();
  }

  public getSchema() {
    return this.schema;
  }

  public getIndexes() {
    return this.schema.getIndexes();
  }

  public canRead() {
    return this.replicator?.canRead();
  }

  public canWrite() {
    return this.replicator?.canWrite();
  }

  public canDelete() {
    return this.replicator?.canDelete();
  }

  public setModelReplicator(replicator: ModelReplicator) {
    this.replicator = replicator;
  }

  public getModelReplicator(): ModelReplicator | undefined {
    return this.replicator;
  }

  public startPullReplication() {
    this.replicator?.startPullReplication();
  }

  public startPushReplication() {
    this.replicator?.startPushReplication();
  }

  public stopPullReplication() {
    this.replicator?.stopPullReplication();
  }

  public stopPushReplication() {
    this.replicator?.stopPushReplication();
  }

  public startSubscriptionReplication() {
    this.replicator?.startWSReplication();
  }

  public stopSubscriptionReplication() {
    this.replicator?.stoptWSReplication();
  }

  public startUploadReplication() {
    this.replicator?.startAttachmentsReplicators();
  }

  public stopUploadReplication() {
    this.replicator?.stopAttachmentsReplicators();
  }

  public query(filterFn?: Filter<T>): Promise<T[]> {
    if (!filterFn) {
      return this.db.table(this.schema.getStoreName()).toArray();
    } else {
      return this.db
        .table(this.schema.getStoreName())
        .filter(filterFn)
        .toArray();
    }
  }

  public queryById(id: string) {
    // console.log(id)
    return this.db
      .table(this.schema.getStoreName())
      .get({ [this.schema.getPrimaryKey()]: id });
  }

  public async save(
    input: Partial<T>,
    eventType: CRUDEvents = CRUDEvents.ADD
  ): Promise<T> {
    input = this.addPrimaryKeyIfNeeded(input);
    const saveInput = JSON.parse(JSON.stringify(input));
    try {
      await this.db.table(this.schema.getStoreName()).put(saveInput);
      if (eventType === CRUDEvents.ADD) {
        this.replicator?.saveChangeForUploadReplication(
          saveInput,
          CRUDEvents.ATTACHMENT_ADD
        );
        this.replicator?.saveChangeForReplication(
          this.generateGraphQLPushData(saveInput),
          CRUDEvents.ADD
        );
      }
      const event = {
        eventType,
        data: [saveInput],
      };
      // console.log('SAVE INPUT', saveInput)
      this.changeEventStream.publish(event);
      return saveInput as T;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update object by detecting it's id and using rest of the fields that are being merged with the original object
   *
   * @param input
   */
  public async updateById(
    input: Partial<T>,
    eventType: CRUDEvents = CRUDEvents.UPDATE
  ) {
    const primaryKey = this.schema.getPrimaryKey();
    if (!(input as any)[primaryKey]) {
      throw "Missing primary key for update";
    }
    const saveInput = JSON.parse(JSON.stringify(input));
    // console.log("SAVE INPUT", saveInput)
    try {
      const result = await this.db
        .table(this.schema.getStoreName())
        .update((saveInput as any)[primaryKey], saveInput);
      if (eventType === CRUDEvents.UPDATE) {
        await this.replicator?.saveChangeForReplication(
          this.generateGraphQLPushData(saveInput),
          CRUDEvents.UPDATE
        );
      }
      if (result === 1) {
        const event = {
          eventType,
          data: [saveInput],
        };
        // console.log('SAVE INPUT', saveInput)
        this.changeEventStream.publish(event);
        return saveInput;
      }
      throw "Error in update";
    } catch (error) {
      throw error;
    }
  }

  /**
   * Remove objects by it's id (using index)
   *
   * @param input object that needs to be removed
   * We need to pass entire object to ensure it's consistency (version)
   */
  public async removeById(
    input: any,
    eventType: CRUDEvents = CRUDEvents.DELETE
  ) {
    const primaryKey = this.schema.getPrimaryKey();
    if (!(input as any)[primaryKey]) {
      throw "Missing primary key for delete";
    }
    delete input._lastUpdatedAt;
    const saveInput = JSON.parse(JSON.stringify(input));
    saveInput[
      this.replicationConfig?.deletedField
        ? this.replicationConfig?.deletedField
        : "deleted"
    ] = true;
    try {
      await this.db
        .table(this.schema.getStoreName())
        .delete((saveInput as any)[primaryKey]);
      if (eventType === CRUDEvents.DELETE) {
        const pushData = this.generateGraphQLPushData(saveInput);
        pushData[
          this.replicationConfig?.deletedField
            ? this.replicationConfig?.deletedField
            : "deleted"
        ] = true;
        await this.replicator?.saveChangeForReplication(
          pushData,
          CRUDEvents.DELETE
        );
      }
      //
      const event = {
        eventType,
        // TODO Why array here?
        data: [saveInput],
      };
      // console.log('SAVE INPUT', saveInput)
      this.changeEventStream.publish(event);
      return saveInput;
    } catch (error) {
      throw error;
    }
  }

  public async deleteSynced() {
    await this.db
      .table(this.getStoreName())
      .where("_lastUpdatedAt")
      .above(0)
      .delete();
    // console.log('deleted field', fields)
    const storeName = metadataModel.getStoreName();
    const idKey = metadataModel.getPrimaryKey();
    const objectToSave = { [idKey]: this.getStoreName(), lastSync: null };
    await this.db.table(storeName).put(objectToSave);
  }

  /**
   * Subscribe to **local** changes that happen in the model
   *
   * TODO add ability to filter subscriptions
   *
   * @param eventType - allows you to specify what event type you are interested in.
   * @param listener
   */
  public subscribe(
    listener: (event: StoreChangeEvent) => void,
    eventTypes?: CRUDEvents[]
  ) {
    // console.log('MODEL SUBSCRIBE')
    return this.changeEventStream.subscribe(
      (event: StoreChangeEvent) => {
        listener(event);
      },
      (event: StoreChangeEvent) => {
        if (eventTypes) {
          return eventTypes.includes(event.eventType);
        }
        return true;
      }
    );
  }

  public async processPullChanges(dataResult: any[]): Promise<void> {
    if (!dataResult || dataResult.length === 0) {
      // console.log('Pull Data processing: No changes')
      return;
    }
    // console.log('processDeltaChanges', dataResult)
    const primaryKey = this.schema.getPrimaryKey();
    const deletedField = this.schema.getDeleteField();
    // console.log('processDeltaChanges', primaryKey, deletedField)
    for (const itemReadOnly of dataResult) {
      // Remove GraphQL internal information
      const item = Object.assign({}, itemReadOnly);
      delete item.__typename;
      // console.log(item, deletedField)
      let data;
      if (deletedField) {
        let eventType: CRUDEvents;
        if (item[deletedField]) {
          // console.log('Delta processing: deleting item')
          data = item;
          await this.removeById(item, CRUDEvents.PULL_DELETE);
          eventType = CRUDEvents.DELETE;
        } else {
          const exist = await this.queryById(item[primaryKey]);
          if (exist) {
            // console.log('Delta processing: updating item')
            eventType = CRUDEvents.UPDATE;
            // add synced field
            item["_lastUpdatedAt"] = new Date().getTime();
            data = item;
            await this.updateById(item, CRUDEvents.PULL_UPDATE);
          } else {
            // console.log('Delta processing: adding item')
            eventType = CRUDEvents.ADD;
            item["_lastUpdatedAt"] = new Date().getTime();
            data = item;
            // add synced field
            await this.save(item, CRUDEvents.PULL_ADD);
          }
        }
        const event = {
          eventType,
          // TODO this should be non array
          data: [data],
        };
        // console.log('SAVE INPUT', data)
        this.changeEventStream.publish(event);
      }
    }
  }

  public processSubscriptionData(dataResult: any[]) {
    // console.log('MODEL: ', this.getName())
    // console.log('Process subs', dataResult)
    this.replicator?.runPerform();
  }

  public async processPushChanges(dataResult: any) {
    if (
      !dataResult[
        this.replicationConfig?.deletedField
          ? this.replicationConfig?.deletedField
          : "deleted"
      ]
    ) {
      const tableName = this.schema.getStoreName();
      const pKey = this.schema.getPrimaryKey();
      await this.db.table(tableName).update(dataResult[pKey], {
        _lastUpdatedAt: new Date().getTime(),
      });
    }
  }

  public async processAttachmentChanges(dataResult: any) {
    const pKey = this.schema.getPrimaryKey();
    if (!dataResult[pKey]) {
      throw "Primary key not provided for attachment upload";
    }
    // const tableName = this.schema.getStoreName()
    const uploadedData = JSON.parse(JSON.stringify(dataResult));
    // console.log('UPDATE ATTACHMENT DATA:', dataResult, uploadedData)
    await this.updateById(uploadedData);
  }

  private addPrimaryKeyIfNeeded(input: any) {
    const primaryKey = this.schema.getPrimaryKey();
    if (!input[primaryKey]) {
      // input[primaryKey] = CLIENT_ID_PREFIX + uid()
      input[primaryKey] = uid();
    }
    return input;
  }

  private generateGraphQLPushData(data: any): any {
    const obj = JSON.parse(JSON.stringify(data));
    const retObj: Record<string, any> = {};
    const gqlFields = this.schema.getGraphQLFields();
    Object.keys(gqlFields).forEach((name) => {
      if (obj[name]) {
        retObj[gqlFields[name]] = obj[name];
      }
    });
    return retObj;
  }

  public testObserve() {
    const storeName = this.schema.getStoreName();
    this.changeEventStream.subscribe((event) =>
      console.log(`Model ${storeName} - event`, event)
    );
  }
}
