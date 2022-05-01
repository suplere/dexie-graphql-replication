import { AuthIndicator } from "./../auth/AuthIndicator";
import { SubscriptionClient } from "subscriptions-transport-ws";
import { ApplicationDexie } from "../DataStore";
import { Model } from "../Model";
import { NetworkIndicator } from "../network/NetworkIndicator";
import { CRUDEvents } from "../utils/CRUDEvents";
import {
  HasuraStorageClient,
  StorageUploadString,
} from "@suplere/hbp-storage-js";
import { AttachmentSchemaProperties } from "../ModelSchema";
import { ApolloClient } from "@apollo/client/core/ApolloClient";

export type ReplicationConfig = {
  db?: ApplicationDexie;
  client?: ApolloClient<any>;
  subsUrl?: string;
  s3Client?: HasuraStorageClient;
};

export interface GraphQLReplicationConfig extends ReplicationConfig {
  wsClient?: SubscriptionClient;
  // authProvider: HasuraAuthClient
  // deletedField: string
  // networkIndicator: NetworkIndicator
}

export interface ModelReplicatorConfig extends ReplicationConfig {
  // wsClient: SubscriptionClient
  networkIndicator: NetworkIndicator;
  model: Model;
  authStatus: AuthIndicator;
  deletedField?: string;
}
export interface AttachmentReplicatorConfig extends ReplicationConfig {
  name: string;
  db: ApplicationDexie;
  s3Client: HasuraStorageClient;
  model: Model;
  attachmentConfig: AttachmentSchemaProperties;
  networkIndicator: NetworkIndicator;
}

export interface PullReplicationConfig extends ReplicationConfig {
  pullInterval?: number;
  networkIndicator: NetworkIndicator;
  model: Model;
  deletedField: string;
}

export interface PushReplicationConfig extends ReplicationConfig {
  networkIndicator: NetworkIndicator;
  model: Model;
  deletedField: string;
}

export interface SubscriptionReplicationConfig extends ModelReplicatorConfig {}

export const PUBLIC_ROLE = "anonymous";

/**
 * Request to perform mutation.
 * This object contain all information needed to perform specific mutations
 */
export interface MutationRequest {
  /**
   * Type of event/operation
   */
  eventType: CRUDEvents;

  /**
   * Data used to send by mutation
   */
  data: any;

  /**
   * Name of the store
   */
  // storeName: string;
}

export interface UploadRequest {
  /**
   * Type of event/operation
   */
  eventType: CRUDEvents;

  /**
   * Data used to send by mutation
   */
  uploadData: StorageUploadString;

  data: any;

  /**
   * Name of the store
   */
  // storeName: string
}
