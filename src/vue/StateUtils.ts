import { Ref, ref } from "vue-demi";
import { ActionType, Maybe } from "../types";

export interface Action<TModel> {
  type: ActionType;
  data?: Maybe<Maybe<TModel>[] | TModel>;
  error?: Maybe<unknown>;
}

export interface ReactiveState<TModel> {
  loading: boolean;
  data: Maybe<TModel>[];
  error: Maybe<unknown>;
}

export interface ReactiveSingleState<TModel> {
  loading: boolean;
  data: Maybe<TModel> | null;
  error: Maybe<unknown>;
}

export const initialState = <TModel>(): Ref<ReactiveState<TModel>> =>
  ref<ReactiveState<TModel>>({
    loading: false,
    data: [],
    error: null,
  }) as Ref<ReactiveState<TModel>>;

export const initialSingleState = <TModel>(): Ref<
  ReactiveSingleState<TModel>
> =>
  ref<ReactiveSingleState<TModel>>({
    loading: false,
    data: null,
    error: null,
  }) as Ref<ReactiveSingleState<TModel>>;

export const changeState = <TModel>({
  action,
  state,
}: {
  state: Ref<ReactiveState<TModel>>;
  action: Action<TModel>;
}) => {
  const data = (() => {
    if (action.data == null) {
      return [];
    }
    if (Array.isArray(action.data)) {
      return action.data;
    }
    return [action.data];
  })();
  switch (action.type) {
    case ActionType.INITIATE_REQUEST:
      state.value.loading = true;
      state.value.error = null;
      break;
    case ActionType.REQUEST_COMPLETE:
      state.value.loading = false;
      state.value.data = data;
      state.value.error = action.error;
      break;
    case ActionType.UPDATE_RESULT:
      // Don't update result when request is loading
      if (!state.value.loading) {
        state.value.data = data;
      }
      break;
  }
  return state;
};

export const changeSingleState = <TModel>({
  action,
  state,
}: {
  state: Ref<ReactiveSingleState<TModel>>;
  action: Action<TModel>;
}) => {
  const data = (() => {
    if (action.data == null) {
      return null;
    }
    if (Array.isArray(action.data)) {
      return action.data[0];
    }
    return action.data;
  })();
  switch (action.type) {
    case ActionType.INITIATE_REQUEST:
      state.value.loading = true;
      state.value.error = null;
      break;
    case ActionType.REQUEST_COMPLETE:
      state.value.loading = false;
      state.value.data = data;
      state.value.error = action.error;
      break;
    case ActionType.UPDATE_RESULT:
      // Don't update result when request is loading
      if (!state.value.loading) {
        state.value.data = data;
      }
      break;
  }
  return state;
};
