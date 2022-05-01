import { onMounted, onUnmounted, ref, Ref, watch } from "vue-demi";
import { Model } from "../../Model";
import { ActionType, Maybe } from "../../types";
import { CRUDEvents } from "../../utils/CRUDEvents";
import { ISubscription } from "../../utils/PushStream";
import { changeState, initialState } from "../StateUtils";

export const useSubscription = <TModel>(
  model: Ref<Model<TModel>>,
  eventTypes: CRUDEvents[]
) => {
  const state = initialState<TModel>();
  const subscription = ref<Maybe<ISubscription>>();

  const subscribe = () => {
    subscription.value = model.value.subscribe((event) => {
      changeState({
        state,
        action: { type: ActionType.REQUEST_COMPLETE, data: event.data },
      });
    }, eventTypes);
  };
  const unsubscribe = () => {
    subscription.value?.unsubscribe();
  };

  watch(
    model,
    () => {
      unsubscribe();
      subscribe();
    },
    { deep: true, immediate: true }
  );

  onMounted(subscribe);
  onUnmounted(unsubscribe);
  return { state: state };
};
