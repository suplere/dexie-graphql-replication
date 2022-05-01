import { Model } from "../../Model";
import { ActionType } from "../../types";
import { changeState, initialState } from "../StateUtils";

export const useRemove = <TModel>(model: Model<TModel>) => {
  const state = initialState<TModel>();

  const remove = async (
    item: Omit<TModel, "_lastUpdatedAt" | "__typename" | "_version">
  ) => {
    if (state.value.loading) {return;}

    changeState<TModel>({
      state,
      action: { type: ActionType.INITIATE_REQUEST }
    });
    try {
      const results = (await model.removeById(item as TModel)) as TModel;
      changeState<TModel>({
        state,
        action: { type: ActionType.REQUEST_COMPLETE, data: results }
      });
      return results;
    } catch (error) {
      changeState<TModel>({
        state,
        action: { type: ActionType.REQUEST_COMPLETE, error }
      });
    }
  };

  return { state: state, remove };
};
