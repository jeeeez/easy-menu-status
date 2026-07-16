declare module '@akiflow/electron-panel-window/build/Release/NativeExtension.node' {
  interface NativePanelWindow {
    MakeKeyWindow(windowHandle: Buffer): boolean;
    MakePanel(windowHandle: Buffer): boolean;
    MakeWindow(windowHandle: Buffer): boolean;
  }

  const nativePanelWindow: NativePanelWindow;
  export default nativePanelWindow;
}
