import { Assertions, Chain, Guard, Log, Pipeline, UiFinder } from '@ephox/agar';
import { UnitTest } from '@ephox/bedrock-client';
import { Cell } from '@ephox/katamari';
import { Editor as McEditor, TinyLoader } from '@ephox/mcagar';
import { Attribute, Css, Html, SelectorFind, SugarBody, SugarElement, SugarShadowDom } from '@ephox/sugar';
import Editor from 'tinymce/core/api/Editor';

import FullscreenPlugin from 'tinymce/plugins/fullscreen/Plugin';
import LinkPlugin from 'tinymce/plugins/link/Plugin';
import SilverTheme from 'tinymce/themes/silver/Theme';

const getContentContainer = (editor: Editor) =>
  SugarShadowDom.getContentContainer(SugarShadowDom.getRootNode(SugarElement.fromDom(editor.getElement())));

const cCloseOnlyWindow = Chain.control(
  Chain.op((editor: Editor) => {
    const dialogs = () => UiFinder.findAllIn(getContentContainer(editor), '[role="dialog"]');
    Assertions.assertEq('One window exists', 1, dialogs().length);
    editor.windowManager.close();
    Assertions.assertEq('No windows exist', 0, dialogs().length);
  }),
  Guard.addLogging('Close window')
);

const cWaitForDialog = (ariaLabel: string) =>
  Chain.control(
    Chain.fromChains([
      Chain.mapper(getContentContainer),
      UiFinder.cWaitFor('Waiting for dialog', '[role="dialog"]'),
      Chain.op((dialog) => {
        if (Attribute.has(dialog, 'aria-labelledby')) {
          const labelledby = Attribute.get(dialog, 'aria-labelledby');
          const dialogLabel = SelectorFind.descendant<HTMLLabelElement>(dialog, '#' + labelledby).getOrDie('Could not find labelledby');
          Assertions.assertEq('Checking label text', ariaLabel, Html.get(dialogLabel));
        } else {
          throw new Error('Dialog did not have an aria-labelledby');
        }
      })
    ]),
    Guard.addLogging('Looking for dialog with an aria-label: ' + ariaLabel)
  );

UnitTest.asynctest('browser.tinymce.plugins.fullscreen.FullScreenPluginTest', (success, failure) => {
  LinkPlugin();
  FullscreenPlugin();
  SilverTheme();

  const lastEventArgs = Cell(null);

  const cAssertEditorAndLastEvent = (label: string, state: boolean) =>
    Chain.control(
      Chain.fromChains([
        Chain.op((editor) => Assertions.assertEq('Editor isFullscreen', state, editor.plugins.fullscreen.isFullscreen())),
        Chain.op(() => Assertions.assertEq('FullscreenStateChanged event', state, lastEventArgs.get().state))
      ]),
      Guard.addLogging(label)
    );

  const cAssertFullscreenClass = (label: string, shouldExist: boolean) => {
    const selector = shouldExist ? 'root:.tox-fullscreen' : 'root::not(.tox-fullscreen)';
    const label2 = `Body and Html should ${shouldExist ? '' : 'not '}have "tox-fullscreen" class`;
    return Chain.control(
      Chain.fromChains([
        Chain.inject(SugarBody.body()),
        UiFinder.cFindIn(selector),
        Chain.inject(SugarElement.fromDom(document.documentElement)),
        UiFinder.cFindIn(selector)
      ]),
      Guard.addLogging(`${label}: ${label2}`)
    );
  };

  const cAsssertEditorContainerStates = (label: string, shouldExist: boolean) =>
    Chain.control(
      Chain.fromChains([
        Chain.fromIsolatedChains([
          Chain.mapper((editor: Editor) => SugarElement.fromDom(editor.getContainer())),
          UiFinder.cFindIn(shouldExist ? 'root:.tox-fullscreen' : 'root::not(.tox-fullscreen)'),
          Chain.op((container) => {
            const containerZIndex = Css.get(container, 'z-index');
            Assertions.assertEq('Editor container z-index', shouldExist ? '1200' : 'auto', containerZIndex);
          })
        ]),
        Chain.fromIsolatedChains([
          Chain.mapper(getContentContainer),
          UiFinder.cFindIn('.tox-silver-sink.tox-tinymce-aux'),
          Chain.op((sink) => {
            const sinkZIndex = Css.get(sink, 'z-index');
            Assertions.assertEq('Editor sink z-index', shouldExist ? '1201' : '1300', sinkZIndex);
          })
        ])
      ]),
      Guard.addLogging(label)
    );

  TinyLoader.setupInBodyAndShadowRoot((editor: Editor, onSuccess, onFailure) => {
    Pipeline.async({}, [
      Log.chainsAsStep('TBA', 'FullScreen: Toggle fullscreen on, open link dialog, insert link, close dialog and toggle fullscreen off', [
        Chain.inject(editor),
        Chain.fromParent(Chain.identity, [
          cAssertFullscreenClass('Before fullscreen command', false),
          Chain.op((editor: Editor) => editor.execCommand('mceFullScreen', true)),
          cAssertEditorAndLastEvent('After fullscreen command', true),
          cAssertFullscreenClass('After fullscreen command', true),
          cAsssertEditorContainerStates('After fullscreen command', true),
          Chain.op((editor: Editor) => editor.execCommand('mceLink', true)),
          cWaitForDialog('Insert/Edit Link'),
          cCloseOnlyWindow,
          cAssertFullscreenClass('After window is closed', true),
          cAsssertEditorContainerStates('After window is closed', true),
          Chain.op((editor: Editor) => editor.execCommand('mceFullScreen')),
          cAssertEditorAndLastEvent('After fullscreen toggled', false),
          cAssertFullscreenClass('After fullscreen toggled', false),
          cAsssertEditorContainerStates('After fullscreen toggled', false)
        ])
      ]),
      Log.chainsAsStep('TBA', 'FullScreen: Toggle fullscreen and remove editor should clean up classes', [
        Chain.inject(editor),
        Chain.fromParent(Chain.identity, [
          Chain.op((editor: Editor) => editor.execCommand('mceFullScreen', true)),
          cAssertEditorAndLastEvent('After fullscreen command', true),
          cAssertFullscreenClass('After fullscreen command', true)
        ]),
        McEditor.cRemove,
        cAssertFullscreenClass('After editor is closed', false)
      ])
    ], onSuccess, onFailure);
  }, {
    plugins: 'fullscreen link',
    theme: 'silver',
    base_url: '/project/tinymce/js/tinymce',
    setup: (editor: Editor) => {
      lastEventArgs.set(null);
      editor.on('FullscreenStateChanged', (e) => {
        editor.setContent('abc');
        lastEventArgs.set(e);
      });
    }
  }, success, failure);
});
