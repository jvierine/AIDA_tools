function obs = irf_asc2obs(filename,varargin)
% irf_asc2obs - Meta-data Obs-struct from filename
%  This function is intended to work as a "try_to_be_smart_fnc"
%  function handle of the typical-pre-processing struct sent as
%  the second argument to INIMG.
%  
% Calling:
%   obs = irf_asc2obs(filename,varargin)
% Input:
%  filename - char array with filename. The current IRF-ASC filename
%             convention seems to be: KRN20170922T181800E02000Q.JPG
%             from that it seems to be KRNyyyymmddTHHMMSSE02000Q.JPG
%             which this function guesses the date and time ofexposure
% Output:
%  OBS - Struct with meta-data for observation
% 
% Example:
%  PO.try_to_be_smart_fnc = @(filename)irf_asc2obs(filename,...
%                           'xyz',[0,0,0],...
%                           'longlat',[-145.1500,62.3930],...
%                           'station',1);
%
%
% AIDA_tools needs fields for TIME and LONGLAT to be be able to
% calculate the image position in azimuth and zenith. Fields for
% xyz with horizontal coordinates in (km) and/or station number is
% also expected for making triangulation/tomography-like analysis
% possible.
%
% See also READ_IMG, INIMG, TRY_TO_BE_SMART ANYTHING2OBS

for i1 = 1:2:length(varargin)
  obs.(varargin{i1}) =  varargin{i1+1};
end

[~,filename] = fileparts(filename);
obs.time = datevec(datenum(filename(4:(4+14)),'yyyymmddTHHMMSS'));

if isfield(obs,'filterfunction')
  obs.filter = obs.filterfunction(N1);
  obs = rmfield(obs,'filterfunction');
end

obs.alpha = [];
obs.beta = [];
obs.az = 0;
obs.ze = 0;
obs.camnr = 39;
%obs.exptime = dt;
if isfield(obs,'verbose')
  obs = obs
end
