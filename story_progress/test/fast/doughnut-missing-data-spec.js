describe("When given a set of stories and tasks that have missing data", function() {
    var donut;
    
    beforeEach(function(){
        donut = Ext.create('Rally.technicalservices.DoughnutPie',{ });
    });
    
    it("should return series when 1 story with no tasks",function(){
        var story = Ext.create('mockStory',{});
        
        donut.inside_records = [story];
        
        var series = donut.calculateSlices();
        
        var story_data = series[0];
        expect(story_data[0].name).toEqual('US1');
        expect(story_data[0].y).toEqual(13);
        expect(story_data[0].color).toEqual('hsla(235,100%,40%,1)');
        
        var task_data = series[1];
        expect(task_data[0].name).toEqual('none');
        expect(task_data[0].y).toEqual(13);
        expect(task_data[0].color).toEqual('white');
        
    });
    
    it("should return series when 1 story with 0 sized tasks",function(){
        var story = Ext.create('mockStory',{});
        var task  = Ext.create('mockTask', { FormattedID: 'TA1', Estimate: null, WorkProduct: story.getData() });
        var task2  = Ext.create('mockTask', { FormattedID: 'TA2', Estimate: 0, WorkProduct: story.getData() });
                
        donut.inside_records = [story];
        donut.outside_records = [task,task2];

        var series = donut.calculateSlices();
        
        var story_data = series[0];
        expect(story_data[0].name).toEqual('US1');
        expect(story_data[0].y).toEqual(13);
        expect(story_data[0].color).toEqual('hsla(235,100%,40%,1)');
        
        var task_data = series[1];
        expect(task_data[0].name).toEqual('TA1');
        expect(task_data[0].y).toEqual(6.5);
        expect(task_data[0].color).toEqual('hsla(235,100%,40%,1)');
        expect(task_data[1].name).toEqual('TA2');
        expect(task_data[1].y).toEqual(6.5);
        expect(task_data[1].color).toEqual('hsla(235,100%,40%,1)');
        
    });
    
    it("should return series when 1 story with 2 tasks, one is empty",function(){
        var story = Ext.create('mockStory',{ PlanEstimate: 10 });
        var task  = Ext.create('mockTask', { FormattedID: 'TA1', Estimate: 2, WorkProduct: story.getData() });
        var task2  = Ext.create('mockTask', { FormattedID: 'TA2', Estimate: 0, WorkProduct: story.getData() });
        
        donut.inside_records = [story];
        donut.outside_records = [task,task2];
        
        var series = donut.calculateSlices();
        
        var story_data = series[0];
        expect(story_data[0].name).toEqual('US1');
        expect(story_data[0].y).toEqual(10);
        expect(story_data[0].color).toEqual('hsla(235,100%,40%,1)');
        
        var task_data = series[1];
        expect(task_data[0].name).toEqual('TA1');
        expect(task_data[0].y).toEqual(10);
        expect(task_data[0].color).toEqual('hsla(235,100%,40%,1)');
        expect(task_data[1].name).toEqual('TA2');
        expect(task_data[1].y).toEqual(0);
        expect(task_data[1].color).toEqual('hsla(235,100%,40%,1)');
        
    });
    
    it("should return series when 2 stories, one story has no tasks",function(){
        var story = Ext.create('mockStory',{ FormattedID: 'US1', PlanEstimate: 10 });
        var story2 = Ext.create('mockStory',{ FormattedID: 'US2', PlanEstimate: 10 });
        var task  = Ext.create('mockTask', { FormattedID: 'TA1', Estimate: 2, WorkProduct: story.getData() });
        var task2  = Ext.create('mockTask', { FormattedID: 'TA2', Estimate: 2, WorkProduct: story.getData() });
        
        donut.inside_records = [story,story2];
        donut.outside_records = [task,task2];
        
        var series = donut.calculateSlices();
        
        var story_data = series[0];
        expect(story_data[0].name).toEqual('US1');
        expect(story_data[0].y).toEqual(10);
        expect(story_data[0].color).toEqual('hsla(235,100%,40%,1)');
        expect(story_data[1].name).toEqual('US2');
        expect(story_data[1].y).toEqual(10);
        expect(story_data[1].color).toEqual('hsla(20,100%,40%,1)');
        
        var task_data = series[1];
        expect(task_data[0].name).toEqual('TA1');
        expect(task_data[0].y).toEqual(5);
        expect(task_data[0].color).toEqual('hsla(235,100%,40%,1)');
        expect(task_data[1].name).toEqual('TA2');
        expect(task_data[1].y).toEqual(5);
        expect(task_data[1].color).toEqual('hsla(235,100%,40%,1)');
        expect(task_data[2].name).toEqual('none');
        expect(task_data[2].y).toEqual(10);
        expect(task_data[2].color).toEqual('white');
                
    });
});
