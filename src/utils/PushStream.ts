import { Observable } from "rxjs";


export interface ISubscription {
  closed: boolean;
  unsubscribe(): void;
}

/**
 * Even stream used to recieve live updates for specific object T
 */
export interface PushStream<T> {
  finishSubscriptions(): void;
  publish(message: T): void;
  subscribe(listener: (message: T) => void, filter?: (value: T) => boolean): ISubscription;
}

export class ObservablePushStream<T> implements PushStream<T> {
  private observable: Observable<T>;
  private observers: any[] = [];

  constructor() {
    this.observable = new Observable(observer => {
      this.observers.push(observer);
    });
  }

  public finishSubscriptions() {
    this.observers.forEach((o) => o.complete());
  }

  public publish(message: T) {
    this.observers.forEach(o => o.next(message));
  }

  public subscribe(listener: (message: T) => void) {
    // if (filter) {
    //   return this.observable.filter(filter).subscribe(listener);
    // }
    return this.observable.subscribe(listener);
  }
}
