/**
 * The various change events that can occur on Local Database
 */
export enum CRUDEvents {
  /**
   * Data was added to the local database
   */
  ADD = 'ADD',

  /**
   * Data was updated in the local database
   */
  UPDATE = 'UPDATE',

  /**
   * Data was deleted from local database
   */
  DELETE = 'DELETE',

  PULL_ADD = 'PULL_ADD',
  PULL_UPDATE = 'PULL_UPDATE',
  PULL_DELETE = 'PULL_DELETE',
  ATTACHMENT_ADD = 'ATTACH_ADD',
  ATTACHMENT_REMOVE = 'ATTACH_REMOVE',
}
