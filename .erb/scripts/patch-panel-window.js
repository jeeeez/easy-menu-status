const fs = require('fs');
const path = require('path');

const sourcePath = path.resolve(
  __dirname,
  '../../release/app/node_modules/@akiflow/electron-panel-window/functions_mac.mm',
);
const source = fs.readFileSync(sourcePath, 'utf8');

if (source.includes('[nswindow setHidesOnDeactivate:NO];')) {
  process.exit(0);
}

const original = `  if ([nswindow isKindOfClass:[PROPanel class]]) {
    return info.GetReturnValue().Set(true);
  }

  Class originalWindowClass = object_getClass(nswindow);
  if (objc_getAssociatedObject(nswindow, kOriginalWindowClassKey) == nil) {
    objc_setAssociatedObject(nswindow,
                             kOriginalWindowClassKey,
                             originalWindowClass,
                             OBJC_ASSOCIATION_ASSIGN);
  }

  nswindow.titlebarAppearsTransparent = true;
  nswindow.titleVisibility = (NSWindowTitleVisibility)1;

//   NSLog(@"stylemask = %ld", mainContentView.window.styleMask);

  // Convert the NSWindow class to PROPanel
  object_setClass(nswindow, [PROPanel class]);

//   NSLog(@"class of main window after = %@", object_getClass(mainContentView.window));
//   NSLog(@"stylemask after = %ld", mainContentView.window.styleMask);



`;
const replacement = `  nswindow.titlebarAppearsTransparent = true;
  nswindow.titleVisibility = (NSWindowTitleVisibility)1;
  [nswindow setStyleMask:[nswindow styleMask] |
                         NSWindowStyleMaskTexturedBackground |
                         NSWindowStyleMaskFullSizeContentView |
                         NSWindowStyleMaskNonactivatingPanel];
  [nswindow setCollectionBehavior:NSWindowCollectionBehaviorCanJoinAllSpaces |
                                  NSWindowCollectionBehaviorFullScreenAuxiliary];
  [nswindow setLevel:NSFloatingWindowLevel];
  [nswindow setHidesOnDeactivate:NO];
`;

if (!source.includes(original)) {
  throw new Error('Unsupported electron-panel-window source version');
}

const updated = source
  .replace(original, replacement)
  .replace(
    '  [mainContentView.window makeKeyWindow];\n  [mainContentView.window makeMainWindow];',
    '  [mainContentView.window makeKeyWindow];',
  )
  .replace(
    / {2}NSWindow\* newWindow[\s\S]*? {2}return info\.GetReturnValue\(\)\.Set\(true\);\n}\n$/,
    '  return info.GetReturnValue().Set(true);\n}\n',
  );

fs.writeFileSync(sourcePath, updated);
