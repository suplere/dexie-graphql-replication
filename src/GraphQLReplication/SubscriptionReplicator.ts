import { DocumentNode } from "graphql";
import { SubscriptionClient } from "subscriptions-transport-ws";
import { NetworkStatusEvent } from "../network/NetworkStatus";
import { buildSubscriptionQuery } from "./builders/buildSubscription";
import { SubscriptionReplicationConfig } from "./types";

export type Headers = {
  [key: string]: string
}

export class SubscriptionReplicator {
  private config: SubscriptionReplicationConfig
  private query: DocumentNode
  private wsClient?: SubscriptionClient
  private clientConnected: boolean

  constructor(config: SubscriptionReplicationConfig) {
    this.config = config
    this.query = buildSubscriptionQuery(this.config)
    this.clientConnected = false
    if (this.config.subsUrl) {
      // console.log('SETUP WS', this.config.subsUrl)
      this.wsClient = new SubscriptionClient(this.config.subsUrl, {
        reconnect: true,
        connectionParams: () => {
          const connectionHeaders = this.headers()
          return {
            headers: connectionHeaders,
          };
        },
        // connectionParams: {
        //   headers: () => this.headers(),
        // },
        timeout: 30 * 1000,
        reconnectionAttempts: 10000,
        // inactivityTimeout: 30 * 1000,
        lazy: true,
      })
      
      // subscribe to change network
      this.config.networkIndicator.subscribe({
        next: (message: NetworkStatusEvent) => {
          if (message.isOnline) {
            if (this.config.model.canRead()) {
              this.startWSSubscription()
            }
            // this.startWSSubscription()
            // console.log('IS ONLINE')
          } else {
            this.stopWSSubscription()
            // console.log('IS OFFLINE')
          }
        },
        complete: () => {},
        error: () => {},
      })

      this.wsClient.onConnected((status) => this.clientConnected = true)

      // this.wsClient.onConnecting((status) => console.log('WS on connecting', status))

      // this.wsClient.onDisconnected((status) => console.log('WS on disconnected', status))

      this.wsClient.onError((error) => console.log('WS error', error))

      // this.wsClient.onReconnected((status) => console.log('WS on reconnected', status))

      // this.wsClient.onReconnecting((status) => console.log('WS on reconnecting', status))
    }
  }

  private headers() {
    const jwt = this.config.authStatus.jwt()
    if (jwt) {
      return {
        Authorization: `Bearer ${jwt}`,
      }
    } else {
      return {}
    }
  }

  public stopWSSubscription() {
    if (this.clientConnected) {
      this.wsClient?.close()
    }
  }

  public startWSSubscription() {
    // console.log('START WS', this.wsClient)
    if (this.wsClient) {
      // console.log('START WS')
      const request = this.wsClient.request({
        query: this.query,
        variables: {
          // lastUpdate: '1990-01-01T00:00:00',
          lastUpdate: new Date().toISOString(),
        },

      })
      request.subscribe({
        next: (resp) => {
          if (resp.data) {
            const modelName = this.config.model.schema.getGraphQlTableName()
            if (resp.data[modelName]) {
              const modelData = resp.data[modelName] as any[]
              this.config.model.processSubscriptionData(modelData)
            }
          }
        },
        complete: () => console.log('ON WS complete'),
        error: (error) => console.log('ON ERROR', error),
      })
    }
  }
}