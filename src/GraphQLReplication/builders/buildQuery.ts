import { DocumentNode } from 'graphql'
import gql from 'graphql-tag'
import { PullReplicationConfig } from '../types'

export const buildQuery = (config: PullReplicationConfig): DocumentNode => {
  const fields: any = config.model.getFields()
  // console.log(`BUILD QUERY MODEL - ${config.model.getStoreName()} :`, fields)
  const fieldsBuilder: string[] = Object.keys(fields)
    .filter((key) => !key.startsWith('_'))
    .map((key) => key)
  // .map((key) => fields[key].key)
  // console.log(`BUILD QUERY MODEL - ${config.model.getStoreName()} :`, fieldsBuilder)
  const graphQLFields = [...fieldsBuilder, config.deletedField].join('\n')
  // console.log(graphQLFields)
  const modelName = config.model.schema.getGraphQlTableName()
  return gql`
    query sync${modelName}($lastSync: timestamptz!) {
      ${modelName}(where: { updated_at: { _gt: $lastSync } }) {
        ${graphQLFields}
      }
    }
  `
}
