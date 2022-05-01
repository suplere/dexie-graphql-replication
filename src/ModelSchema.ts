import { PUBLIC_ROLE } from "./GraphQLReplication/types";
import { JSONSchema7 } from "json-schema";

/**
 * Defines the properties expected in the Fields object for a model
 */
export type Fields<T> = Record<keyof T, ModelSchemaProperties>;

export type GraphQLFields = Record<string, string>;

export type Attachments = Record<string, AttachmentSchemaProperties>;

export type Permissions = {
  read: string[];
  write: string[];
  delete: string[];
};

/**
 * Represents generated schema with models
 */
export interface GeneratedModelSchema {
  [model: string]: ModelJsonSchema<any>;
}

export interface AttachmentSchemaProperties extends JSONSchema7 {
  /* S3 save path - from model properties */
  uploadedPathField: string;

  /* model path for uploaded attachment - uploaded URL*/
  dataPathField: string;

  /* temporary filed for attachment */
  dataField: string;
}

export interface ModelSchemaProperties extends JSONSchema7 {
  /**
   * Index field, whether or not the
   * field should be indexed
   */
  index?: boolean;
  /**
   * Primary key field flag if the field is
   * the primary key
   */
  primary?: boolean;
  /**
   * Default value for the field
   */
  default?: any;
  /**
   * Flag for if the field should be encrypted
   */
  encrypted?: boolean;
  /**
   * GraphQL field name used for graphql query generation
   */
  key?: string;
}

export declare class ModelJsonSchema<T> {
  /**
   * Model name
   */
  name: string;
  /**
   * tableName name
   */
  graphQlTableName?: string;
  /**
   * Namespace for the field in storage
   * default is `user_<Model name>`
   */
  namespace?: string;
  /**
   * Model version number
   */
  version?: number;
  /**
   * Array of indexed fields
   */
  indexes?: string[];
  /**
   * Array of encrypted fields
   */
  encrypted?: string[];
  /**
   * Primary key reference
   */
  primaryKey?: string;
  /**
   * JsonSchema requirement
   * This is hardcoded to "object"
   */
  permissions?: Permissions;
  type: "object";
  /**
   * List of all the fields and their specific
   * options i.e
   * id: {
   *  primary: true,
   *  ... other options
   * }
   */
  properties?: Fields<T>;

  /* List fields for attachments */
  attachments?: Attachments;
}

/**
 * ModelSchema class used to convert
 * JsonSchema options into schema that
 * can be used in the DataStore Models
 *
 */
export class ModelSchema<T = any> {
  private name: string;
  private tableName?: string;
  private namespace: string;
  private primaryKey: string;
  private fields: Fields<T>;
  private attachments?: Attachments;
  private encrypted: string[];
  private version: number;
  private indexes: string[] = [];
  private deleteField: string = "deleted";
  private permissions?: Permissions;
  private graphQLFields: GraphQLFields;

  constructor(schema: ModelJsonSchema<T>) {
    this.version = schema.version || 0;
    this.name = schema.name;
    this.tableName = schema.graphQlTableName;
    this.namespace = schema.namespace || "user";
    this.permissions = schema.permissions
      ? schema.permissions
      : {
          delete: [PUBLIC_ROLE],
          read: [PUBLIC_ROLE],
          write: [PUBLIC_ROLE],
        };
    this.fields = extractFields(schema);
    this.attachments = extractAttachments(schema);
    this.primaryKey = extractPrimary(this.fields, schema.primaryKey);
    this.indexes = extractIndexes(this.fields, schema.indexes);
    this.encrypted = extractEncryptedFields(this.fields, schema.encrypted);
    this.graphQLFields = extractGraphQLFields(this.fields);
    // console.log(schema)
  }

  /**
   * Getter method for name
   *
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Getter method for namesapce
   *
   */
  public getNamespace(): string {
    return this.namespace;
  }

  /**
   * Computed method for store name
   * which is a combination of the
   * namespace and the model name
   *
   */
  public getStoreName(): string {
    return `${this.namespace}_${this.name}`;
  }

  public getDeleteField(): string {
    return this.deleteField;
  }

  public getPermissions(): Permissions {
    return this.permissions
      ? this.permissions
      : {
          read: ["anonymous"],
          delete: ["anonymous"],
          write: ["anonymous"],
        };
  }

  /**
   * Get the model index fields
   *
   */
  public getIndexes(): string[] {
    return this.indexes;
  }

  /**
   * Get primary key name
   *
   */
  public getPrimaryKey(): string {
    return this.primaryKey;
  }

  /**
   * Get all the the model fields
   *
   */
  public getFields(): Fields<T> {
    return this.fields;
  }

  public getGraphQLFields(): GraphQLFields {
    return this.graphQLFields;
  }

  /* get all attachments */
  public getAttachments(): string[] {
    return this.attachments ? Object.keys(this.attachments) : [];
  }

  /* get attachment config*/
  public getAttachmentsConfig(
    name: string
  ): AttachmentSchemaProperties | undefined {
    const attachmentConfig =
      this.attachments && this.attachments[name]
        ? this.attachments[name]
        : undefined;
    return attachmentConfig;
  }

  /**
   * Get the model version
   *
   */
  public getVersion(): number {
    return this.version;
  }

  /**
   * Get the encrypted fields
   *
   */
  public getEncryptedFields(): string[] {
    return this.encrypted;
  }

  public getGraphQlTableName(): string {
    return this.tableName ? this.tableName : "";
  }
}

/**
 * Helper function to extract the fields from the json schema
 *
 * @param schema json schema object
 */
function extractFields<T = any>(schema: ModelJsonSchema<T>): Fields<T> {
  // simple validation
  if (schema.properties) return schema.properties;
  else throw "Properties cannot be undefined";
}

function extractAttachments<T = any>(
  schema: ModelJsonSchema<T>
): Attachments | undefined {
  // simple validation
  if (schema.attachments) return schema.attachments;
  else return undefined;
}

/**
 * Helper function to extract the indexes from the json schema
 *
 * @param schema json schema object
 */
function extractIndexes<T = any>(
  fields: Fields<T>,
  indexes?: string[]
): string[] {
  // if no index array, iterate through
  // the fields and check for `index: true`
  if (!indexes) {
    return Object.keys(fields).reduce<string[]>((acc, key) => {
      const field = fields[key as keyof T];
      if (field.index) {
        if (field.primary) {
          acc.push(`&${key}`);
        } else {
          acc.push(key);
        }
      }
      return acc;
    }, []);
    // return Object.keys(fields).filter((key: string) => {
    //   const field = fields[key as keyof T]
    //   if (field.index) {
    //     return key
    //   }
    // })
  }
  indexes.forEach((index) => {
    // check to see if the item in the
    // index array is a field inside the
    // json schema
    if (!(index in fields))
      throw `${index} in the indexes array is missing
      from the properties field in the model schema`;
  });
  return indexes;
}

/**
 * Helper function to extract the fields from the json schema
 *
 * @param schema json schema object
 */
function extractPrimary<T = any>(
  fields: Fields<T>,
  primaryKey?: string
): string {
  // if primary key is not specified
  // iterate through fields for primary key
  if (!primaryKey) {
    const obj = Object.keys(fields).find(
      (key: string) => fields[key as keyof T].primary
    );
    // primary key is required, so throw error if
    // not provided
    if (!obj)
      throw "DataStore: no primary key provided. Please specify a primary key";
    return obj;
  }
  if (!(primaryKey in fields))
    throw `DataStore: ${primaryKey} provided does not exist in
    the properties of the modelschema`;
  return primaryKey;
}

/**
 * Helper function to extract the encrypted fields from the json schema
 *
 * @param schema json schema object
 */
function extractEncryptedFields<T = any>(
  fields: Fields<T>,
  encrypted?: string[]
): string[] {
  // if an array is not specified,
  // iterate through fields to check for
  // encrypted fields
  if (!encrypted) {
    return Object.keys(fields).filter(
      (key) => fields[key as keyof T].encrypted
    );
  }
  encrypted.forEach((enc) => {
    // validation to ensure that
    // encrypted fields exist
    // in the schema properties
    if (!(enc in fields))
      throw `DataStore: ${enc} in the encrypted fields array is missing
      from the properties field in the model schema`;
  });
  return encrypted;
}

function extractGraphQLFields<T = any>(fields: Fields<T>): GraphQLFields {
  const ret: GraphQLFields = {};
  Object.keys(fields)
    .filter((key) => fields[key as keyof T].key)
    .forEach((name) => {
      ret[name] = fields[name as keyof T].key as string;
    });
  return ret;
}

/**
 * Simple factory method, this can be expanded upon to
 * add additional validation if required
 *
 * @param schema json schema object
 */
export function createModelSchema<T = any>(
  schema: ModelJsonSchema<T>
): ModelSchema<T> {
  const modelSchema = new ModelSchema<T>(schema);
  return modelSchema;
}
