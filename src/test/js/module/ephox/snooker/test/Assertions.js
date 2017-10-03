define(
  'ephox.snooker.test.Assertions',

  [
    'ephox.katamari.api.Arr',
    'ephox.katamari.api.Fun',
    'ephox.katamari.api.Option',
    'ephox.katamari.api.Options',
    'ephox.snooker.api.ResizeDirection',
    'ephox.snooker.api.ResizeWire',
    'ephox.snooker.api.TableOperations',
    'ephox.snooker.resize.Bars',
    'ephox.snooker.test.Bridge',
    'ephox.sugar.api.properties.Attr',
    'ephox.sugar.api.node.Body',
    'ephox.sugar.api.properties.Css',
    'ephox.sugar.api.node.Element',
    'ephox.sugar.api.dom.Hierarchy',
    'ephox.sugar.api.properties.Html',
    'ephox.sugar.api.dom.Insert',
    'ephox.sugar.api.dom.Remove',
    'ephox.sugar.api.search.SelectorFilter',
    'ephox.sugar.api.search.Traverse'
  ],

  function (Arr, Fun, Option, Options, ResizeDirection, ResizeWire, TableOperations, Bars, Bridge, Attr, Body, Css, Element, Hierarchy, Html, Insert, Remove, SelectorFilter, Traverse) {
    var assertInfo = function (expected, actual) {
      var cleaner = Arr.map(actual, function (row) {
        var cells = Arr.map(row.cells(), function (c) {
          return { element: c.element(), rowspan: c.rowspan(), colspan: c.colspan() };
        });
      });

      assert.eq(expected, cleaner);
    };

    var checkOld = function (expCell, expectedHtml, input, operation, section, row, column, _direction) {
      var table = Element.fromHtml(input);
      Insert.append(Body.body(), table);
      var wire = ResizeWire.only(Body.body());
      var direction = _direction === undefined ? ResizeDirection.ltr : _direction;
      var result = operation(wire, table, { element: Fun.constant(Hierarchy.follow(table, [ section, row, column, 0 ]).getOrDie()) }, Bridge.generators, direction, Fun.noop, Fun.noop);

      var actualPath = Hierarchy.path(table, result.getOrDie().cursor().getOrDie()).getOrDie('could not find path');
      assert.eq([ expCell.section, expCell.row, expCell.column ], actualPath);

      // Presence.assertHas(expected, table, 'checking the operation on table: ' + Html.getOuter(table));

      // Let's get rid of size information.
      var all = [ table ].concat(SelectorFilter.descendants(table, 'td,th'));
      Arr.each(all, function (elem) { Css.remove(elem, 'width'); });

      assert.eq(expectedHtml, Html.getOuter(table));
      Remove.remove(table);
      // Ensure all the resize bars are destroyed before of running the next test.
      Bars.destroy(wire);
    };

    var checkStructure = function (expCell, expected, input, operation, section, row, column, _direction) {
      var table = Element.fromHtml(input);
      Insert.append(Body.body(), table);
      var wire = ResizeWire.only(Body.body());
      var direction = _direction === undefined ? ResizeDirection.ltr : _direction;
      var result = operation(wire, table, { element: Fun.constant(Hierarchy.follow(table, [ section, row, column, 0 ]).getOrDie()) }, Bridge.generators, direction, Fun.noop, Fun.noop);

      var actualPath = Hierarchy.path(table, result.getOrDie().cursor().getOrDie()).getOrDie('could not find path');
      assert.eq([ expCell.section, expCell.row, expCell.column ], actualPath);

      // Presence.assertHas(expected, table, 'checking the operation on table: ' + Html.getOuter(table));
      var rows = SelectorFilter.descendants(table, 'tr');
      var actual = Arr.map(rows, function (row) {
        var cells = SelectorFilter.descendants(row, 'td,th');
        return Arr.map(cells, Html.get);
      });
      assert.eq(expected, actual);
      Remove.remove(table);
      Bars.destroy(wire);
    };

    var checkDelete = function (optExpCell, optExpectedHtml, input, operation, cells, platform, _direction) {
      var table = Element.fromHtml(input);
      Insert.append(Body.body(), table);
      var wire = ResizeWire.only(Body.body());
      var direction = _direction === undefined ? ResizeDirection.ltr : _direction;
      var cellz = Arr.map(cells, function (cell) {
        return Hierarchy.follow(table, [ cell.section, cell.row, cell.column, 0 ]).getOrDie('Could not find cell');
      });


      var result = operation(wire, table, {
          selection: Fun.constant(cellz)
      }, Bridge.generators, direction, Fun.noop, Fun.noop);

      // The operation might delete the whole table
      optExpCell.each(function (expCell) {
        var actualPath = Hierarchy.path(table, result.getOrDie().cursor().getOrDie('could not find cursor')).getOrDie('could not find path');
        assert.eq([ expCell.section, expCell.row, expCell.column ], actualPath);
      });


      // Let's get rid of size information.
      var all = [ table ].concat(SelectorFilter.descendants(table, 'td,th'));
      Arr.each(all, function (elem) { Css.remove(elem, 'width'); });

      optExpectedHtml.fold(function () {
        // the result of a delete operation can be by definition the deletion of the table itself.
        // If that is the case our table should not have any parent element because has been removed
        // from the DOM
        assert.eq(false, Traverse.parent(table).isSome(), 'The table was expected to be removed from the DOM');

      }, function (expectedHtml) {
        if (platform.browser.isIE() || platform.browser.isSpartan()) {
          assert.eq(expectedHtml.ie, Html.getOuter(table));
        } else {
          assert.eq(expectedHtml.normal, Html.getOuter(table));
        }
        Remove.remove(table);
      });


      // Ensure all the resize bars are destroyed before of running the next test.
      Bars.destroy(wire);
    };

    var checkMerge = function (label, expected, input, selection, bounds, _direction) {
      var table = Element.fromHtml(input);
      var expectedDom = Element.fromHtml(expected);

      Insert.append(Body.body(), expectedDom);
      Insert.append(Body.body(), table);

      var wire = ResizeWire.only(Body.body());
      var direction = _direction === undefined ? ResizeDirection.ltr : _direction;
      var target = Bridge.targetStub(selection, bounds, table);
      var generators = Bridge.generators;

      TableOperations.mergeCells(wire, table, target, generators, direction);

      // Let's get rid of size information.
      var all = [ table ].concat(SelectorFilter.descendants(table, 'td,th'));
      Arr.each(all, function (elem) { Css.remove(elem, 'width'); });

      assert.eq('1', Attr.get(table, 'border'));
      // Get around ordering of attribute differences.
      Attr.remove(table, 'border');
      assert.eq(expected, Html.getOuter(table));

      Remove.remove(table);
      Remove.remove(expectedDom);
      Bars.destroy(wire);
    };

    var checkUnmerge = function (expected, input, unmergablePaths, _direction) {
      var table = Element.fromHtml(input);
      Insert.append(Body.body(), table);
      var wire = ResizeWire.only(Body.body());
      var direction = _direction === undefined ? ResizeDirection.ltr : _direction;
      var unmergables = Arr.map(unmergablePaths, function (path) {
        return Hierarchy.follow(table, [ path.section, path.row, path.column ]);
      });

      var unmergable = Option.some(Options.cat(unmergables));

      TableOperations.unmergeCells(wire, table, { unmergable: Fun.constant(unmergable) }, Bridge.generators, direction, Fun.noop, Fun.noop);
      // Presence.assertHas(expected, table, 'checking the operation on table: ' + Html.getOuter(table));

      // Let's get rid of size information.
      var all = [ table ].concat(SelectorFilter.descendants(table, 'td,th'));
      Arr.each(all, function (elem) { Css.remove(elem, 'width'); });

      assert.eq(expected, Html.getOuter(table));
      Remove.remove(table);
      Bars.destroy(wire);
    };

    return {
      assertInfo: assertInfo,
      checkOld: checkOld,
      checkStructure: checkStructure,
      checkDelete: checkDelete,
      checkMerge: checkMerge,
      checkUnmerge: checkUnmerge
    };
  }
);