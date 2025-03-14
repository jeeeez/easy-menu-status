import { WindowInstance } from './window-instance';

export class WindowManager {
  // eslint-disable-next-line no-use-before-define
  private static $instances: Record<string, WindowInstance> = {};
  static instance(name: string): WindowInstance {
    if (!WindowManager.$instances[name]) {
      const window = new WindowInstance();
      WindowManager.$instances[name] = window;
    }
    return WindowManager.$instances[name];
  }
}
