#include "json2.jsx"
var AIFlow = (function () {
    function fail(code) { throw new Error(code); }
    function projectPath() { return app.project && app.project.file ? app.project.file.fsName : null; }
    function context() {
        if (!projectPath()) fail('SAVE_PROJECT');
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) fail('OPEN_COMP');
        if (comp.selectedLayers.length > 1) fail('SELECT_ONE');
        var layer = comp.selectedLayers.length === 1 ? comp.selectedLayers[0] : null;
        var source = layer && layer instanceof AVLayer ? layer.source : null;
        return { projectPath: projectPath(), compId: comp.id, compName: comp.name, compWidth: comp.width, compHeight: comp.height,
            compTime: comp.time, layerId: layer ? layer.id : null, layerName: layer ? layer.name : null, sourceId: source ? source.id : null,
            width: source ? source.width : comp.width, height: source ? source.height : comp.height,
            pixelAspect: source ? source.pixelAspect : comp.pixelAspect, forceNew: !source,
            startTime: layer ? layer.startTime : comp.time, inPoint: layer ? layer.inPoint : comp.time, outPoint: layer ? layer.outPoint : comp.duration };
    }
    function findComp(id) {
        for (var i=1; i<=app.project.numItems; i++) if (app.project.item(i).id === id && app.project.item(i) instanceof CompItem) return app.project.item(i);
        return null;
    }
    function findLayer(comp, id) {
        if (!id) return null;
        for (var i=1; i<=comp.numLayers; i++) if (comp.layer(i).id === id) return comp.layer(i);
        return null;
    }
    function source(input) {
        var target = context(), comp = app.project.activeItem;
        if (!target.layerId) fail('SELECT_LAYER');
        var layer = findLayer(comp, target.layerId), src = layer instanceof AVLayer ? layer.source : null;
        if (!src) fail('NO_SOURCE');
        if (src instanceof FootageItem && src.file && /\.(png|jpe?g|webp)$/i.test(src.file.name) && src.mainSource.isStill) {
            return { target: target, path: src.file.fsName, kind: 'source' };
        }
        if (!input.outputPath) fail('NO_PATH');
        var temp = null, queued = false;
        app.beginUndoGroup('AI Flow: кадр исходника');
        try {
            var fps = src.frameRate || comp.frameRate || 25;
            var duration = Math.max(src.duration || 1, 1/fps);
            temp = app.project.items.addComp('__AIFlow_frame__', src.width, src.height, src.pixelAspect, duration, fps);
            temp.layers.add(src);
            var time = layer.timeRemapEnabled ? layer.property('ADBE Time Remapping').valueAtTime(comp.time, false) : (comp.time-layer.startTime)*100/layer.stretch;
            time = Math.max(0, Math.min(time, duration-1/fps));
            temp.saveFrameToPng(time, new File(input.outputPath));
            queued = true;
        } finally {
            // AE writes asynchronously; keep the render source alive until the panel confirms completion.
            if (temp && !queued) temp.remove();
            app.endUndoGroup();
        }
        return { target: target, path: input.outputPath, kind: 'source-frame', temporaryCompId:temp.id };
    }
    function cleanup(input) {
        var comp = findComp(input.temporaryCompId);
        if (comp && comp.name === '__AIFlow_frame__') comp.remove();
        return {cleaned:true};
    }
    function capture(input) {
        var target = context(), comp = app.project.activeItem;
        comp.saveFrameToPng(comp.time, new File(input.outputPath));
        // The full composition frame already includes transforms/effects. Import as a new layer.
        target.forceNew = true; target.width = comp.width; target.height = comp.height; target.pixelAspect = comp.pixelAspect;
        return { target: target, path: input.outputPath, kind: 'composition-frame' };
    }
    function footageFolder() {
        for (var i=1; i<=app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof FolderItem && item.name === 'AI Generations' && item.parentFolder === app.project.rootFolder) return item;
        }
        return app.project.items.addFolder('AI Generations');
    }
    function importResult(input) {
        var target = input.target;
        if (!projectPath() || new File(projectPath()).fsName !== new File(target.projectPath).fsName) fail('PROJECT_CHANGED');
        if (!new File(input.path).exists) fail('FILE_MISSING');
        var comp = findComp(target.compId);
        if (!comp) fail('COMP_MISSING');
        var original = findLayer(comp, target.layerId);
        var marker = 'AIFlow job:' + input.jobId;
        // Idempotency across a panel reload, including interrupted ledger writes.
        for (var l=1; l<=comp.numLayers; l++) {
            if (comp.layer(l).comment.indexOf(marker) !== -1) return { mode: 'already', width: comp.layer(l).width, height: comp.layer(l).height };
        }
        app.beginUndoGroup('AI Flow: результат генерации');
        var imported = null;
        try {
            imported = app.project.importFile(new ImportOptions(new File(input.path)));
            imported.parentFolder = footageFolder(); imported.comment = marker;
            var same = imported.width === target.width && imported.height === target.height && Math.abs(imported.pixelAspect-target.pixelAspect) < 0.0001;
            var unchanged = original && original instanceof AVLayer && original.source && original.source.id === target.sourceId;
            var mode = 'new', layer;
            if (same && unchanged && !target.forceNew && !original.locked) {
                original.replaceSource(imported, false);
                original.comment = original.comment + (original.comment ? '\n' : '') + marker;
                mode = 'replace'; layer = original;
            } else {
                layer = comp.layers.add(imported);
                layer.name = 'AI · ' + imported.name;
                layer.startTime = target.layerId ? target.inPoint : target.compTime;
                layer.property('ADBE Transform Group').property('ADBE Scale').setValue([100,100]);
                layer.comment = marker;
                if (original) layer.moveBefore(original);
            }
            return { mode: mode, width: imported.width, height: imported.height, dimensionMismatch: !same, duration: imported.duration,
                targetMissing: !!target.layerId && !original, targetChanged: !!original && !unchanged, sourceDuration: imported.duration };
        } finally { app.endUndoGroup(); }
    }
    function dispatch(method, encoded) {
        try {
            var input = encoded ? JSON.parse(decodeURIComponent(encoded)) : {};
            var result;
            if (method === 'context') result = context();
            else if (method === 'source') result = source(input);
            else if (method === 'capture') result = capture(input);
            else if (method === 'cleanup') result = cleanup(input);
            else if (method === 'import') result = importResult(input);
            else if (method === 'ping') result = {version:app.version};
            else fail('UNKNOWN_METHOD');
            return JSON.stringify({ok:true, data:result});
        } catch (error) {
            var known = ['SAVE_PROJECT','OPEN_COMP','SELECT_ONE','SELECT_LAYER','NO_SOURCE','NO_PATH','PROJECT_CHANGED','FILE_MISSING','COMP_MISSING','UNKNOWN_METHOD'];
            var code = 'AE_ERROR';
            for (var i=0; i<known.length; i++) if (error.message === known[i]) code = known[i];
            return JSON.stringify({ok:false, code:code});
        }
    }
    return {dispatch:dispatch};
}());
