import { HasuraAuthClient } from "@suplere/hbp-auth-js/dist";
import { GraphQLReplicationConfig } from "./GraphQLReplication/types";

/**
 * Configuration Options for DataStore
 */
export interface DataStoreConfig {
  /**
   * The Database name
   */
  dbName?: string;

  /**
   * The Schema Version number. Used to trigger a Schema upgrade
   */
  schemaVersion?: number;

  /**
   * Configuration for replication engine
   */
  replicationConfig?: GraphQLReplicationConfig;

  authProvider: HasuraAuthClient;
}
