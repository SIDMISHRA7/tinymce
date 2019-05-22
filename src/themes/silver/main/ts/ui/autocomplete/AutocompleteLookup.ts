/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { InlineContent, Types } from '@ephox/bridge';
import { Range, Text } from '@ephox/dom-globals';
import { Arr, Option, Options, Fun } from '@ephox/katamari';
import Editor from 'tinymce/core/api/Editor';
import Promise from 'tinymce/core/api/util/Promise';
import DOMUtils from 'tinymce/core/api/dom/DOMUtils';

import { getContext } from './AutocompleteContext';
import { AutocompleterDatabase } from './Autocompleters';
import { Phase, repeatLeft } from '../../alien/TextSearch';

const isStartOfWord = (dom: DOMUtils) => {
  const process = (phase: Phase<boolean>, element: Text, text: string, optOffset: Option<number>) => {
    const index = optOffset.getOr(text.length);
    // If at the start of the range, then we need to look backwards one more place. Otherwise we just need to look at the current text
    return (index === 0) ? phase.kontinue() : phase.finish(/\s/.test(text.charAt(index - 1)));
  };

  return (rng: Range) => repeatLeft(dom, rng.startContainer as Text, rng.startOffset, process).fold(Fun.constant(true), Fun.constant(true), Fun.identity);
};

const getTriggerContext = (dom: DOMUtils, initRange: Range, database: AutocompleterDatabase): Option<{ range: Range, text: string, triggerChar: string }> => {
  return Options.findMap(database.triggerChars, (ch) => {
    return getContext(dom, initRange, ch).map(({ rng, text }) => {
      return { range: rng, text, triggerChar: ch };
    });
  });
};

export interface AutocompleteLookupData {
  context: any;
  items: InlineContent.AutocompleterItemApi[];
  columns: Types.ColumnTypes;
  onAction: (autoApi: InlineContent.AutocompleterInstanceApi, rng, value: string, meta: Record<string, any>) => void;
}

const lookup = (editor: Editor, getDatabase: () => AutocompleterDatabase): Option<{ range: Range, triggerChar: string; lookupData: Promise<AutocompleteLookupData[]> }> => {
  const database = getDatabase();
  const rng = editor.selection.getRng();
  const startText = rng.startContainer.nodeValue;

  return getTriggerContext(editor.dom, rng, database).map((context) => {
    const autocompleters = Arr.filter(database.lookupByChar(context.triggerChar), (autocompleter) => {
      return context.text.length >= autocompleter.minChars && autocompleter.matches.getOr(isStartOfWord(editor.dom))(context.range, startText, context.text);
    });
    const lookupData = Promise.all(Arr.map(autocompleters, (ac) => {
      // TODO: Find a sensible way to do maxResults
      const fetchResult = ac.fetch(context.text, ac.maxResults);
      return fetchResult.then((results) => ({
        context,
        items: results,
        columns: ac.columns,
        onAction: ac.onAction
      }));
    }));

    return {
      lookupData,
      triggerChar: context.triggerChar,
      range: context.range
    };
  });
};

export {
  lookup
};