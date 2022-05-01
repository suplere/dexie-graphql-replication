import { ref, Ref, watch } from "vue-demi";
import { Model } from "../../Model";
import { ActionType, Filter, Maybe } from "../../types";
import { CRUDEvents } from "../../utils/CRUDEvents";
import { StoreChangeEvent } from "../../utils/StoreChangeEvent";
import { changeState, initialState, ReactiveState } from "../StateUtils";

interface UpdateArr<T> {
  oldArr: T[];
  newArr: T[];
  primaryKeyName: string;
}

const updateArr = <T>({ oldArr, newArr, primaryKeyName }: UpdateArr<T>) => {
  const finalArr = [...oldArr];
  const map = new Map(
    oldArr.map((el, i) => [(el as Record<string, unknown>)[primaryKeyName], i])
  );
  for (const newItem of newArr) {
    const newItemKey = (newItem as Record<string, unknown>)[primaryKeyName];
    const i = map.get(newItemKey);
    if (i != null && i >= 0) {
      finalArr.splice(i, 1, newItem);
    } else {
      finalArr.push(newItem);
    }
  }
  return finalArr;
};

const onAdded = <TItem>(
  state: Ref<ReactiveState<TItem>>,
  newData: TItem[],
  primaryKeyName: string
) =>
  updateArr({
    newArr: newData,
    oldArr: state.value.data,
    primaryKeyName,
  });

const onChanged = <TItem>(
  state: Ref<ReactiveState<TItem>>,
  newData: TItem[],
  primaryKeyName: string
) => {
  if (state.value.data.length === 0) {
    return state.value.data;
  }
  return updateArr({
    newArr: newData,
    oldArr: state.value.data,
    primaryKeyName,
  });
};

const onRemoved = <TItem>(
  state: Ref<ReactiveState<TItem>>,
  removedData: TItem[],
  primaryKeyName: string
) => {
  if (state.value.data.length === 0) {
    return state.value.data;
  }
  const changedData = state.value.data.filter((d) => {
    const dPrimaryKey = (d as Record<string, unknown>)[primaryKeyName];
    return removedData.findIndex(
      (newD) =>
        (newD as Record<string, unknown>)[primaryKeyName] === dPrimaryKey
    );
  });
  return changedData;
};

export const updateResult = <TItem>(
  state: Ref<ReactiveState<TItem>>,
  event: StoreChangeEvent,
  primaryKeyName: string
) => {
  // console.log('UPDATE RESULT',state, event, primaryKeyName)
  const data = event.data;
  switch (event.eventType) {
    case CRUDEvents.ADD:
      return onAdded(state, data, primaryKeyName);
    case CRUDEvents.UPDATE:
      return onChanged(state, data, primaryKeyName);
    case CRUDEvents.DELETE:
      return onRemoved(state, data, primaryKeyName);
    case CRUDEvents.PULL_UPDATE:
      return onChanged(state, data, primaryKeyName);
    default:
      console.log(`Invalid event ${event.eventType} received`);
      return state.value.data;
    // throw new Error(`Invalid event ${event.eventType} received`);
  }
};

const createSubscribeToUpdates = <TItem>(
  state: Ref<ReactiveState<TItem>>,
  model: Model<TItem>
) => {
  return (
    eventsToWatch?: CRUDEvents[],
    customEventHandler?: (
      state: Ref<ReactiveState<TItem>>,
      data: Maybe<TItem | Maybe<TItem>[]>
    ) => Maybe<TItem | Maybe<TItem>[]>
  ) => {
    // console.log('createSubscribeToUpdates')
    const subscription = model.subscribe((event) => {
      let newData;
      // console.log('IN SUBSCRIPTION', event)
      if (customEventHandler) {
        newData = customEventHandler(state, event.data);
      }
      const primaryKeyName = model.getSchema().getPrimaryKey();
      newData = updateResult(state, event, primaryKeyName);

      if (!subscription.closed) {
        // Important to check beacuse Componnent could be unmounted
        changeState({
          state,
          action: { type: ActionType.UPDATE_RESULT, data: newData },
        });
      }
    }, eventsToWatch);
    return subscription;
  };
};

interface QueryResults<TItem> extends UseQuery<TItem> {
  state: Ref<ReactiveState<TItem>>;
}
const queryResults = async <TItem>({
  state,
  filter,
  model,
}: QueryResults<TItem>) => {
  if (state.value.loading) {
    return;
  }

  changeState({ state, action: { type: ActionType.INITIATE_REQUEST } });
  try {
    let results;
    const filterValue = filter;
    if (typeof filterValue === "string") {
      results = await model.queryById(filterValue);
    } else {
      results = await model.query(filterValue);
    }
    changeState({
      state,
      action: { type: ActionType.REQUEST_COMPLETE, data: results },
    });
  } catch (error) {
    changeState({
      state,
      action: { type: ActionType.REQUEST_COMPLETE, error },
    });
  }
  return state;
};

interface UseQuery<TItem> {
  model: Model<TItem>;
  filter?: Filter<TItem> | string | undefined;
}
const subscribeQueryToUpdates = <TItem>({
  state,
  model,
}: {
  state: Ref<ReactiveState<TItem>>;
  model: Ref<Model<TItem>>;
}) => {
  // console.log('subscribeQueryToUpdates', model.value.getStoreName())
  let subscriptionFn = createSubscribeToUpdates(state, model.value);
  watch(
    model,
    () => {
      subscriptionFn = createSubscribeToUpdates(state, model.value);
    },
    { deep: true, immediate: true }
  );
  return subscriptionFn;
};

export const useQuery = <TItem>(arg: UseQuery<TItem>) => {
  const argRef = ref(arg);
  const modelRef = ref(arg.model) as Ref<Model<TItem>>;

  const state = initialState<TItem>();
  const subscribeToUpdates = subscribeQueryToUpdates({
    model: modelRef,
    state,
  });
  const runQuery = async () => {
    await queryResults({
      model: arg.model,
      state,
      filter: arg.filter,
    });
  };
  watch(argRef, runQuery, { deep: true, immediate: true });
  return { state: state, subscribeToUpdates };
};

export const useLazyQuery = <TItem>({ model }: { model: Model<TItem> }) => {
  const modelRef = ref(model) as Ref<Model<TItem>>;

  const state = initialState<TItem>();
  const subscribeToUpdates = subscribeQueryToUpdates({
    model: modelRef,
    state,
  });
  const query = async ({
    filter,
  }: {
    filter: Filter<TItem> | string | undefined;
  }) =>
    await queryResults<TItem>({
      model,
      filter,
      state,
    });
  return { state: state, query, subscribeToUpdates };
};
