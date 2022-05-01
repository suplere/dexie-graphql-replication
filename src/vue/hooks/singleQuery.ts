import { Ref, ref, watch } from "vue-demi";
import { Model } from "../../Model";
import { ActionType, Filter, Maybe } from "../../types";
import { CRUDEvents } from "../../utils/CRUDEvents";
import { StoreChangeEvent } from "../../utils/StoreChangeEvent";
import { Action, initialSingleState, ReactiveSingleState } from "../StateUtils";

interface UseQuery<TItem> {
  model: Model<TItem>;
  filter: Filter<TItem> | string;
}

interface QueryResults<TItem> extends UseQuery<TItem> {
  state: Ref<ReactiveSingleState<TItem>>;
}

const queryResults = async <TItem>({
  state,
  filter,
  model,
}: QueryResults<TItem>) => {
  if (state.value.loading) {
    return;
  }

  changeSingleState({ state, action: { type: ActionType.INITIATE_REQUEST } });
  try {
    let result;
    const filterValue = filter;
    if (typeof filterValue === "string") {
      result = await model.queryById(filterValue);
    } else {
      result = await model.query(filterValue);
    }
    changeSingleState({
      state,
      action: { type: ActionType.REQUEST_COMPLETE, data: result },
    });
  } catch (error) {
    changeSingleState({
      state,
      action: { type: ActionType.REQUEST_COMPLETE, error },
    });
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
  // console.log('changeSingleState', state.value)
  return state;
};

interface UpdateObj<T> {
  oldObj: T;
  newObj: T;
  primaryKeyName: string;
}

const updateObj = <T>({ oldObj, newObj, primaryKeyName }: UpdateObj<T>) => {
  const oldObjParsed = oldObj ? JSON.parse(JSON.stringify(oldObj)) : {};
  const newObjParsed = newObj ? JSON.parse(JSON.stringify(newObj)) : {};
  return Object.assign(oldObjParsed, newObjParsed);
};

const onAdded = <TItem>(
  state: Ref<ReactiveSingleState<TItem>>,
  newData: TItem,
  primaryKeyName: string
) => {
  // console.log('newObj', newData)
  // console.log('oldObj', state.value.data)
  updateObj({
    newObj: newData,
    oldObj: state.value.data,
    primaryKeyName,
  });
};

const onChanged = <TItem>(
  state: Ref<ReactiveSingleState<TItem>>,
  newData: TItem,
  primaryKeyName: string
) =>
  updateObj({
    newObj: newData,
    oldObj: state.value.data,
    primaryKeyName,
  });

export const updateSingleResult = <TItem>(
  state: Ref<ReactiveSingleState<TItem>>,
  event: StoreChangeEvent,
  primaryKeyName: string
) => {
  // console.log('UPDATE RESULT', state, event, primaryKeyName)
  const data = event.data[0];
  switch (event.eventType) {
    case CRUDEvents.ADD:
      return onAdded(state, data, primaryKeyName);
    case CRUDEvents.UPDATE:
      return onChanged(state, data, primaryKeyName);
    case CRUDEvents.DELETE:
      return null;
    case CRUDEvents.PULL_UPDATE:
      return onChanged(state, data, primaryKeyName);
    default:
      console.log(`Invalid event ${event.eventType} received`);
      return state.value.data;
    // throw new Error(`Invalid event ${event.eventType} received`);
  }
};

const createSubscribeToUpdates = <TItem>(
  state: Ref<ReactiveSingleState<TItem>>,
  model: Model<TItem>,
  filter: Filter<TItem> | string
) => {
  return (
    eventsToWatch?: CRUDEvents[],
    customEventHandler?: (
      state: Ref<ReactiveSingleState<TItem>>,
      data: Maybe<TItem | Maybe<TItem>[]>
    ) => Maybe<TItem | Maybe<TItem>[]>
  ) => {
    // console.log('createSubscribeToUpdates')
    const subscription = model.subscribe((event) => {
      const primaryKeyName = model.getSchema().getPrimaryKey();
      // check if event is relevant
      const filterValue = filter;
      let passed = false;
      if (typeof filterValue === "string") {
        // check primary field
        if (event.data[0][primaryKeyName] === filter) passed = true;
      } else {
        // run function
        if (filterValue(event.data[0])) passed = true;
      }
      if (passed) {
        let newData;
        // console.log('IN SUBSCRIPTION', event, filterValue)
        if (customEventHandler) {
          newData = customEventHandler(state, event.data);
        }

        // console.log('createSubscribeToUpdates', event, filter)

        newData = updateSingleResult(state, event, primaryKeyName);

        if (!subscription.closed) {
          // Important to check beacuse Componnent could be unmounted
          changeSingleState({
            state,
            action: { type: ActionType.UPDATE_RESULT, data: newData },
          });
        }
      }
    }, eventsToWatch);
    return subscription;
  };
};

const subscribeQueryToUpdates = <TItem>({
  state,
  model,
  filter,
}: {
  state: Ref<ReactiveSingleState<TItem>>;
  model: Ref<Model<TItem>>;
  filter: Filter<TItem> | string;
}) => {
  // console.log('subscribeQueryToUpdates')
  let subscriptionFn = createSubscribeToUpdates(state, model.value, filter);
  watch(
    model,
    () => {
      subscriptionFn = createSubscribeToUpdates(state, model.value, filter);
    },
    { deep: true, immediate: true }
  );
  return subscriptionFn;
};

export const useSingleQuery = <TItem>(arg: UseQuery<TItem>) => {
  const argRef = ref(arg);
  const modelRef = ref(arg.model) as Ref<Model<TItem>>;

  const state = initialSingleState<TItem>();
  const subscribeToUpdates = subscribeQueryToUpdates({
    model: modelRef,
    state,
    filter: arg.filter,
  });
  const runQuery = async () => {
    await queryResults({
      model: arg.model,
      state,
      filter: arg.filter,
    });
  };
  watch(argRef, runQuery, { deep: true, immediate: true });
  // watch(state, (val) => console.log('STATE CHANGED', val), { deep: true, immediate: true })
  return { state: state, subscribeToUpdates };
};
