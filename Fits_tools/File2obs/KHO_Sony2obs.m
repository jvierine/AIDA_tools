function obs = KHO_Sony2obs(filename,varargin)
% KHO_Sony2obs - Meta-data Obs-struct from filename
%  This function is intended to work as a "try_to_be_smart_fnc"
%  function handle of the typical-pre-processing struct sent as
%  the second argument to INIMG.
%  
% Calling:
%   obs = anything2obs(filename,varargin)
% Input:
%  filename - char array with filename. The standard Pike-imaging
%             software enumerates images sequentially.
%  varargin - a name - value sequence, where each value will be put
%             into the OBS-field of its preceeding name.
% Output:
%  OBS - Struct with meta-data for observation
% 
% AIDA_tools needs fields for TIME and LONGLAT to be be able to
% calculate the image position in azimuth and zenith. Fields for
% xyz with horizontal coordinates in (km) and/or station number is
% also expected for making triangulation/tomography-like analysis
% possible.
%
% Example:
%  PO.try_to_be_smart_fnc = @(filename)KHO_Sony2obs(filename,...
%                           'xyz',[0,0,0],...
%                           'longlat',[16.040, 78.1478],...
%                           'station',181);
% 
% This will assign the camera position to 16.04 degrees East and
% 78.1478 North (according to Google-maps satelite image, assign a
% ficticious station-number 181 and set the camera at the origin of
% a cartesian coordinate system.
%
% See also READ_IMG, INIMG, TRY_TO_BE_SMART

for i1 = 1:2:length(varargin)
  obs.(varargin{i1}) =  varargin{i1+1};
end


% Extract the running image number in the observation sequence,
% assuming it is found at the end of the filename (before the
% extension:)
%[q1,q2,q3] = fileparts(filename);
% and that the character before is some kind of separator:
%[t1,r] = strtok(fliplr(q2),'-._: '); 
%N1 = str2num(fliplr(t1));

% If dt is not supplied in the name-value sequence just use the
% creation-date of the file, and hope for the best.

% $$$ info = imfinfo(filename);
% $$$ obs.time = datevec(info.DigitalCamera.DateTimeOriginal,'yyyy:mm:dd HH:MM:SS')
% $$$ t2 = datevec(info.DateTime,'yyyy:mm:dd HH:MM:SS');
% $$$ if ~isequal(obs.time,t2)
% $$$   disp(['Getting conflicting time-information for image: ',filename])
% $$$   disp('info.DigitalCamera.DateTimeOriginal indicates:')
% $$$   disp(obs.time)
% $$$   disp('while info.DateTime indicates:')
% $$$   disp(t2)
% $$$   obs.time = input('Give actual time-of-observation [yyyy mm dd HH MM SS]: ')
% $$$ end
[fdir,fname,ext] = fileparts(filename);
yyyy = 2000 + str2num(fname(14:15));
mm = str2num(fname(12:13));
dd = str2num(fname(10:11));
HH = str2num(fname(17:18));           
MM = str2num(fname(19:20));
SS = str2num(fname(21:22));   
obs.time = [yyyy,mm,dd,HH,MM,SS];
if isfield(obs,'filterfunction')
  obs.filter = obs.filterfunction(N1);
  obs = rmfield(obs,'filterfunction');
end

obs.alpha = [];
obs.beta = [];
obs.az = [0];
obs.ze = [0];
obs.camnr = [39];
%obs.exptime = dt;
if isfield(obs,'verbose')
  obs = obs
end
