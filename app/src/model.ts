import model from '../assets/model/basicGestures.json';

export type GestureModelEntry = {
  id: string;
  label: string;
};

export type GestureModel = {
  gestures: GestureModelEntry[];
};

export const gestureModel: GestureModel = model as GestureModel;
