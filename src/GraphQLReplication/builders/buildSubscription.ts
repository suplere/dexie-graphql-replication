import { DocumentNode } from 'graphql'
import gql from 'graphql-tag'
import { SubscriptionReplicationConfig } from '../types'

export const buildSubscriptionQuery = (config: SubscriptionReplicationConfig): DocumentNode => {
  const primaryKey = config.model.schema.getPrimaryKey()
  const modelName = config.model.schema.getGraphQlTableName()
  return gql`
    subscription subnew${modelName}($lastUpdate: timestamptz!) {
      ${modelName}(where: {updated_at: {_gt: $lastUpdate}}, order_by: {created_at: asc}) {
        ${primaryKey}
        updated_at
      }
    }
`
}
