import { Observable, from } from 'rxjs'
import { liveQuery as liveQueryDexie } from 'dexie'

export function liveQueryRx<T>(querier: () => T | Promise<T>): Observable<T> {
  return from(liveQueryDexie(querier))
}

/**
 * Extracts data from non generic return object from graphql query.
 * For example for
 * `data.createUser.{somedata}` will return `{somedata}`
 * @param result
 */
export const getFirstOperationData = (result: any) => {
  if (result.data) {
    const keys = Object.keys(result.data);
    if (keys.length !== 1) {
      return;
    }
    const firstOperationName = keys[0];
    return result.data[firstOperationName];
  }
};

export const removeUnderscore = (data: any): any => {
  let obj = Object.assign({}, data)
  let underScoreFields = Object.keys(obj).filter(name => name.startsWith('_'))
  underScoreFields.forEach(underRemove => {
    delete obj[underRemove]
  })
  return obj
}