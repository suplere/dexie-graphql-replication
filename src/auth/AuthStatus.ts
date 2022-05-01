import { Observer, Subscription } from "rxjs";

export interface AuthStatusEvent {
  isAuthenticated: boolean;
  roles: string[]
  jwt?: string
};

export interface AuthStatus {
  /** Indicator for whether the client is online or not */
  isAuthenticated(): boolean;

  roles(): string[]

  jwt(): string | undefined

  /** Function for subscribing to the observable AuthEvent */
  subscribe(observer: Partial<Observer<AuthStatusEvent>> | any): Subscription;
}
