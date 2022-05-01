import { DocumentNode } from "graphql";
import gql from "graphql-tag";
import { PushReplicationConfig } from "../types";


export const buildMutation = (config: PushReplicationConfig): DocumentNode => {
  const fields: any = config.model.getFields()
  const primaryKey = config.model.schema.getPrimaryKey()
  const fieldsBuilder: string[] = Object.keys(fields)
    .filter((key) => !key.startsWith('_'))
    .map((key) => fields[key].key)
  const graphQLFields = [...fieldsBuilder, config.deletedField]
  const graphQLFieldsReturning = graphQLFields.join('\n')
  const updatedField = graphQLFields.filter(f => f !== primaryKey)
  const modelName = config.model.schema.getGraphQlTableName()
  return gql`
    mutation save_${modelName}($data: [${modelName}_insert_input!]!) {
      insert_${modelName}(objects: $data, on_conflict: {constraint: ${modelName}_pkey, update_columns: [${updatedField}]}) {
        returning {
          ${graphQLFieldsReturning}
        }
      }
    }
  `
}

