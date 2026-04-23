function timelineClicked(obj,varargin)
obj
%parent = obj;
relativeTime = parent.CurrentPoint;
relativeTime = relativeTime(1);%xposition
cu = parent.Position;
relPos = relativeTime/cu(3);
cxl = soundAndTimelineAx.XLim;
%dx = range(cxl);
dx = cxl(2)-cxl(1);
relativeTime = cxl(1)+relPos*dx;
progressMarker.XData = [relativeTime relativeTime];
%progressMarker.YData = [-1,1.2];
time = duration*relativeTime(1);
%jumpTo([],'request','timeValue','requestedValue',time);
end %timelineClicked
