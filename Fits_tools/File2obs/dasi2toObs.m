function obs = dasi2toObs(img_head)
% KOSCH_IN_RAMFJORD - make Observation struct from filename
%   
% WARNING Outdated! should be fixed before usage...

% persistent Station_names
persistent stationpos

delimiters = [9:13 32];
delimiters = [delimiters,'~=+*/^()[]{}<>,;:'''];

if isempty(stationpos)
  stationpos = load('stationpos.dat');
end

station = 11;

obs.longlat = [sum(stationpos(station,5:7).*[1 1/60 1/3600]), ...
               sum(stationpos(station,1:3).*[1 1/60 1/3600])* ...
               stationpos(station,4)];
obs.pos     = obs.longlat;
obs.station = 11;
obs.alpha   = [];
obs.beta    = [];
obs.az      = 180;
obs.ze      = 0;
obs.camnr   = 37;
obs.cmtr = eye(3);

hindx = fitsfindinheader(img_head,'DATE-OBS');

if ~isempty(hindx)
  delimiters = [delimiters,'-T'];
  timestr = img_head(hindx,11:end);
  [year,timestr] = strtok(timestr,delimiters);
  [month,timestr] = strtok(timestr,delimiters);
  [day,timestr] = strtok(timestr,delimiters);
  [hour,timestr] = strtok(timestr,delimiters);
  [minute,timestr] = strtok(timestr,delimiters);
  [sec] = strtok(timestr,delimiters);
  obs.time = [str2num(year) str2num(month) str2num(day) str2num(hour) str2num(minute) str2num(sec)];
  if length(obs.time) < 6
    hindx = fitsfindinheader(img_head,'TIME-OBS');
    timestr = img_head(hindx,11:end);
    [hour,timestr] = strtok(timestr,delimiters);
    [minute,timestr] = strtok(timestr,delimiters);
    [sec] = strtok(timestr,delimiters);
    obs.time = [obs.time str2num(hour) str2num(minute) str2num(sec)];
  end
  
end
