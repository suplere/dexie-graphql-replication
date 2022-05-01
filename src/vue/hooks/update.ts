import { Model } from "../../Model";
import { ActionType } from "../../types";
import { changeState, initialState } from "../StateUtils";

export const useUpdate = <TInput, TModel>(model: Model<TModel>) => {
  const state = initialState<TModel>();

  const update = async (input: TInput, upsert: boolean = false) => {
    if (state.value.loading) {return;}

    changeState<TModel>({
      state,
      action: { type: ActionType.INITIATE_REQUEST }
    });
    try {
      const results = (await (upsert
        ? model.save(input)
        : model.updateById(input))) as TModel;
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

  return { state: state, update };
};
