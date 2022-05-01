import { HasuraAuthClient } from "@suplere/hbp-auth-js/dist";
import { Observer, Subject, Subscription } from "rxjs";
import { PUBLIC_ROLE } from "../GraphQLReplication/types";
import { AuthStatus, AuthStatusEvent } from "./AuthStatus";

export class AuthIndicator implements AuthStatus {
  public authState: Subject<AuthStatusEvent>;
  private authProvider: HasuraAuthClient;

  /**
   * @param authStatus - platform dependent auth status
   * that indicaes device getting lost of the wifi or mobile data access
   */
  public constructor(authProvider: HasuraAuthClient) {
    this.authProvider = authProvider;
    this.authState = new Subject<AuthStatusEvent>();
    // console.log(this.authProvider)
    this.authState.next({
      isAuthenticated: this.authProvider.isAuthenticated(),
      roles: this.authProvider.isAuthenticated()
        ? (this.authProvider.getUserRoles() as string[])
        : [],
      jwt: this.authProvider.getAccessToken(),
    });
    this.authProvider.onAuthStateChanged((event, session) => {
      // console.log('AUTH Changed', session)
      if (session) {
        this.authState.next({
          isAuthenticated: true,
          jwt: session.accessToken,
          roles: [...(authProvider.getUserRoles() as string[]), PUBLIC_ROLE],
        });
      } else {
        this.authState.next({
          isAuthenticated: false,
          jwt: undefined,
          roles: [PUBLIC_ROLE],
        });
      }
    });
  }

  /**
   * Using system indicator to check if app is connected
   */
  public isAuthenticated(): boolean {
    return !!this.authProvider.isAuthenticated();
  }

  public jwt() {
    return this.authProvider.getAccessToken();
  }

  public roles() {
    return [...(this.authProvider.getUserRoles() as string[]), PUBLIC_ROLE];
  }

  public subscribe(observer: Observer<AuthStatusEvent>): Subscription {
    return this.authState.subscribe(observer);
  }
}
