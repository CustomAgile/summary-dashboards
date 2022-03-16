Ext.define('wip-limits', {
    extend : 'Rally.app.App',
    logger: new Rally.technicalservices.Logger(),
    layout : {
        type : "fit"
    },
    mixins : [
        'Rally.Messageable'
    ],
    
    release: null,
    iteration: null,
    
    keyPrefix: 'project-wip:',
    
    launch : function() {

        this.subscribe(this, 'timeboxReleaseChanged', this._changeRelease, this);
        this.subscribe(this, 'timeboxIterationChanged', this._changeIteration, this);
        this.publish('requestTimebox', this);
        this._launch();
    },
    
    _launch: function(releaseName, iterationName) {
        var me = this;
        Deft.Promise.all([
            this._getAvailableStates(),
            this._getProjects(),
            this._getPrefs()
        ]).then({
            scope: this,
            success: function(results) {
                this.states = results[0];
                this.projects = results[1];
                this.preferences = results[2];
                this.logger.log('prefs:', this.preferences);
                
                this.projects_by_oid = {};
                Ext.Array.each(this.projects, function(project){
                    var oid = project.get('ObjectID');
                    this.projects_by_oid[oid] = project.getData();
                },this);
                
                this.prefs_by_name = {};
                Ext.Array.each(this.preferences, function(preference){
                    var name = preference.get('Name');
                    this.prefs_by_name[name] = preference;
                },this);
                
                this._updateBoard();
            }
        }).always(function() { me.setLoading(false); });
    },
    
    _changeRelease: function(release) {
        if ( this.release !== release ) {
            this.release = release;
            this._launch();
        }
    },

    _changeIteration: function(iteration) {
        if ( iteration !== this.iteration ) {
            this.iteration = iteration;
            this._launch();
        }
    },
    
    _updateBoard : function() {
        this.setLoading('Finding Stories...');
        
        var filters = [];
        if ( this.release ) { 
            filters = { property:'Release.Name', value: this.release.get('Name') };
        }
        if ( this.iteration ) { 
            filters = { property:'Iteration.Name', value: this.iteration.get('Name') };
        }
        
        var store = Ext.create('Rally.data.wsapi.Store', {
            model : 'hierarchicalrequirement',
            filters: filters,
            fetch : [
                'ObjectID',
                'Name',
                'FormattedID',
                'Project',
                'ScheduleState',
                'Parent',
                'Children'
            ],
            limit : Infinity
        });
        store.on('load', this._onStoriesLoaded, this);
        store.load();
    },
    
    _onStoriesLoaded : function(store, stories) {
        var me = this;
        var states = this.states;
        
        this.setLoading(false);
        
        var projectGroup = _.groupBy(stories, function(t){
            return t.get("Project") ? t.get("Project").ObjectID : "none";
        });
        
        me.summaries = _.map(_.keys(projectGroup), function(project_oid) {
            var stories = projectGroup[project_oid];
            var project = me.projects_by_oid[project_oid] || "none";
            return me._getSummary(stories, project);
        }, this);
        
        // set wip limits from memory
        Ext.Array.each(me.summaries, function(row) {
            Ext.Array.each(states, function(state) {
                var wipKey = state + 'WIP';
                me._getWipLimit(wipKey,row);
            });
        });
        
        // roll up data through tree
        var rolled_up_data = me._rollUpValues(me.summaries);
        
        me.gridStore = Ext.create('Rally.data.custom.Store', {
            data : rolled_up_data,
            sorters : {
                property : 'projectName',
                direction : 'ASC'
            }
        });
        
        me.gridStore.addListener('update', function(store, record, op, fieldNames, eOpts){
            if (op == 'edit') {
                var projectName = record.get('projectName');
                var fieldName = _.first(fieldNames);
                var value = record.get(fieldName) || 0;
                if ( record.get('leaf') ) {
                    var original_value = me.summaries_by_oid[record.get('ObjectID')][fieldName] || 0;
                    var delta = value - original_value;
                    
                    if ( delta !== 0 ) {
                        me._setWipLimit(projectName, fieldName, value);
                        var parent = record.get('project').Parent;
    
                        me.summaries_by_oid[record.get('ObjectID')][fieldName] = value;
                        me._rollUpToParent(fieldName, delta, record.getData(), me.summaries_by_oid[parent.ObjectID]);
                        
                        me._updateStoreValues(fieldName);
                    }
                } else {
                    me.logger.log("Can only set wip on children");
                }
            }
        }, store, {
        // single: true
        });
        me._displayGrid(me.gridStore);

    },
    
    _updateStoreValues: function(field){
        this.logger.log('_updateStoreValues', field);
        var store = this.gridStore;
        Ext.Object.each(this.summaries_by_oid,function(oid,summary){
            var record = store.findRecord('ObjectID',oid);
            record.set(field, summary[field]);
        });
    },
    
    _getSummary: function(stories, project){
        var me = this;
        var counts = _.countBy(stories, function(story) {
            return story.get('ScheduleState');
        });
        
        var values = {};
        
        _.each(me.states, function(state){
            values[state] = _.isUndefined(counts[state]) ? 0 : counts[state];
            var wipKey = state + 'WIP';
            values[wipKey] = 0;
        });
        values.project = project;
        values.projectName = project.Name;
        values.ObjectID = project.ObjectID;
        
        values.leaf = ( !project.Children || project.Children.Count === 0 );
        
        return values;
    },
    
    _rollUpValues: function(summaries) {
        var me = this;
        this.logger.log('_rollUpValues');
        
        var leaves = Ext.Array.filter(summaries, function(summary) {
            return ( summary.leaf );
        });
        
        me.summaries_by_oid = {};
        Ext.Array.each(summaries, function(summary){
            me.summaries_by_oid[summary.project.ObjectID] = summary;
        });
        
        Ext.Array.each( leaves, function(leaf){
            if (! Ext.isEmpty( leaf.project.Parent ) ) {
                Ext.Object.each(leaf, function(field, value){
                    var parent = me.summaries_by_oid[leaf.project.Parent.ObjectID];
                    if ( /WIP/.test(field) ) {
                        this._rollUpToParent(field, value, leaf, parent);
                    } 
                },this);
            } 
        },this);
        
        var updated_summaries = Ext.Object.getValues(me.summaries_by_oid);
        
        var tops = Ext.Array.filter(updated_summaries, function(summary){ 
            return (!summary.project.Parent); 
        } );
        
        me.children_by_parent_oid = {};
        Ext.Array.each(updated_summaries, function(summary){
            var parent = summary.project.Parent;
            if ( !Ext.isEmpty(parent) ) {
                var parent_oid = parent.ObjectID;
                if ( !me.children_by_parent_oid[parent_oid] ){
                    me.children_by_parent_oid[parent_oid] = [];
                }
                me.children_by_parent_oid[parent_oid].push(summary);
            }
        });
        
        // go top down for when every node level can have a value
        // (not just built up from the bottom like wip limits
        Ext.Array.each(tops, function(top){
            Ext.Object.each(top, function(field, value){
                if ( Ext.Array.contains(me.states,field) ) {
                    me._rollUpFromChildren(top,field);
                } 
            },this);
        });
        
        return updated_summaries;
        
    },
    
    _rollUpFromChildren: function(parent, field){
        var me = this;
        var parent_oid = parent.project.ObjectID;
        
        var parent_value = me.summaries_by_oid[parent_oid][field] || 0;
        var children = me.children_by_parent_oid[parent_oid];
        var total_value = parent_value;
        
        Ext.Array.each(children, function(child){
            var child_value = child[field] || 0;
            if ( ! Ext.isEmpty( me.children_by_parent_oid[child.project.ObjectID] ) ) {
                child_value = me._rollUpFromChildren(child,field);
            }
            total_value = child_value + total_value;
        });
        me.summaries_by_oid[parent_oid][field] = total_value;
        return total_value;
    },
    
    _rollUpToParent: function(field, value, child, parent) {
        var me = this;
        
        if ( child.project.ObjectID !== this.getContext().getProject().ObjectID ) {
           
            if ( Ext.isEmpty(parent) ){
                var parent_oid = child.project.Parent.ObjectID;
                if ( ! me.summaries_by_oid[parent_oid] ) {
                    parent_project = this.projects_by_oid[parent_oid];                    
                    me.summaries_by_oid[parent_oid] = this._getSummary([],parent_project);
                }
                parent = me.summaries_by_oid[parent_oid];
            }
            
            if ( parent ) {
                var child_value = value || 0;
                var parent_value = parent[field] || 0;

                parent[field] = child_value + parent_value;
                
                var grand_parent = parent.project.Parent;
                if ( !Ext.isEmpty(grand_parent) ) {
                    me._rollUpToParent(field, value, parent,me.summaries_by_oid[grand_parent.ObjectID]);
                }
            }
        }
        return me.summaries_by_oid;
    },
    
    _displayGrid : function(store) {
        var that = this;
        this.remove('workqueue');
        this.add({
            xtype : 'rallygrid',
            itemId : 'workqueue',
            store : store,
            showPagingToolbar: false,
            columnCfgs : [
                {
                    text : 'Project',
                    dataIndex : 'projectName',
                    flex : 6,
                    align : 'center'
                },
                {
                    text : 'Defined',
                    dataIndex : 'Defined',
                    flex : 0.8,
                    align : 'center'
                },
                {
                    text : 'Defined Limit',
                    dataIndex : 'DefinedWIP',
                    flex : 0.8,
                    editor : {
                        xtype : 'numberfield'
                    },
                    renderer : that.renderLimit,
                    align : 'center'
                },
                {
                    text : 'In-Progress',
                    dataIndex : 'In-Progress',
                    flex : 0.8,
                    align : 'center'
                },
                {
                    text : 'In-Progress Limit',
                    dataIndex : 'In-ProgressWIP',
                    flex : 0.8,
                    editor : {
                        xtype : 'textfield'
                    },
                    renderer : that.renderLimit,
                    align : 'center'
                },
                {
                    text : 'Completed',
                    dataIndex : 'Completed',
                    flex : 0.8,
                    align : 'center'
                },
                {
                    text : 'Completed Limit',
                    dataIndex : 'CompletedWIP',
                    flex : 0.8,
                    editor : {
                        xtype : 'textfield'
                    },
                    renderer : that.renderLimit,
                    align : 'center'
                }
            ],
            editingConfig: {
                listeners: {
                    'beforeEdit': function(editor, evt) {
                        var record = evt.record;
                        
                        return record.get('leaf');
                    }
                }
            }
        });
    },
    
    renderLimit : function(value, meta, record, row, col, store, gridView) {
        meta.tdCls = 'limit';
        var display_value = value;
        
        if ( !record.get('leaf') ) {
            meta.tdCls = 'parentProject';
        }

        return display_value;
    },
    
    _setWipLimit : function(projectName, state, limit) {
        var me = this;
        var key = this._getWipKey(projectName, state);
        var settings = {};
        settings[key] = Ext.JSON.encode(limit);
        var workspace = this.getContext().getWorkspace();
        Rally.data.PreferenceManager.update({
            workspace : workspace,
            filterByName : key,
            settings : settings
        }).then({
            success : function(updatedRecords, notUpdatedRecord, options)
            {
                me.logger.log("Wrote WIP limit: ", key, settings, updatedRecords, notUpdatedRecord, options);
                me.publish('ts-wip-change');
            
            },
            failure : function()
            {
                me.logger.log("Failed to write preference: ", key, settings);
            }
        });
    },
    
    _getWipKey : function(project, state) {
        return this.keyPrefix + project + ':' + state;
    },
    
    _getWipLimit : function(state, row) {
        var key = this._getWipKey(row.projectName, state);
        
        var pref = this.prefs_by_name[key];
        if (pref && pref.get('Value') && row.leaf ) {
            row[state] = parseInt( Ext.JSON.decode(pref.get('Value')), 10 );
        }
        return row;
    },
    
    _getProjects: function() {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.setLoading("Loading projects");
                  
        Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            fetch: ['ObjectID','Name','Parent','Children'],
            filters: [{property:'State',value:'Open'}],
            limit: 'Infinity'
        }).load({
            callback : function(records, operation, successful) {
                me.setLoading(false);
                
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _getPrefs: function() {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.setLoading("Loading prefs");
        
        Ext.create('Rally.data.wsapi.Store', {
            model: 'Preference',
            fetch: ['Name','Value','ObjectID'],
            filters: [{property:'Name',operator:'contains',value:me.keyPrefix}],
            limit: 'Infinity'
        }).load({
            callback : function(records, operation, successful) {
                me.setLoading(false);
                
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _getAvailableStates: function() {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        
        this.scheduleStates = [];
        
        Rally.data.ModelFactory.getModel({
            type: 'UserStory',
            success: function(model) {
                model.getField('ScheduleState').getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        Ext.Array.each(records, function(allowedValue) {
                            me.scheduleStates.push(allowedValue.get('StringValue'));
                        });
                        
                        deferred.resolve(me.scheduleStates);
                    }
                });
            }
        });
        return deferred.promise;
    }
});