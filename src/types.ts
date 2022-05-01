export type Filter<T> = (obj: T) => boolean

export type DexieStoresType = { 
  [tableName: string]: string | null; 
}

export enum ActionType {
  INITIATE_REQUEST,
  REQUEST_COMPLETE,
  UPDATE_RESULT,
  DELTA_FORCED,
}

export type Maybe<T> = T | null
