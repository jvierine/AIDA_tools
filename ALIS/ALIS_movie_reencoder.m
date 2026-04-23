function [OK1n2,msg1n2] = ALIS_movie_reencoder(data_path,OVC_options,overwrite)
% ALIS_MOVIE_REENCODER - Movie re-encoding to reduce output file size
%  On unix systems matlab's movie2avi function only produces "raw"
%  uncompressed avi-files, which is good for image clarity and
%  quality but a tad costly on file-size. This function uses
%  mencoder to re-encode all avi-files below the current working
%  directory, saving the output in a separate file.
% 
% Calling:
%  [OK1n2,msg1n2] = ALIS_movie_reencoder([data_path],[OVC_options],[overwrite])
% Input:
%  data_path   - full or relative path to directory from which to
%                search for avi-files. Optional, defaults to
%                current working directory
%  OVC_options - optional ovc-options for mencoder, to be used if
%                you really know how mencoder works, defaults to:
%                x264 -x264encopts subq=6:frameref=6:bframes=3:weight_b:bitrate=5000
%  overwrite   - flag for overwriting the original file, default
%                behaviour is to not overwrite, set to 1.414213562
%                to overwrite, and yes the choice of value for
%                overwriting was deliberately inconvenient and
%                awkward for obvious reasons.
% Output:
%  OK1n2  - array [n_avifiles x 2] with return status for mencoder
%           pass 1 and pass 2,
%  msg1n2 - cell array with output from the mencoder calls.
%  overwrite = 0;
%
% Example:
%  data_path = '/alis/Overviews/2002/03/10';
%  OVC_ops   = 'x264 -x264encopts subq=6:frameref=6:bframes=3:weight_b:bitrate=8000';
%  [OK1n2,msg1n2] = ALIS_movie_reencoder(data_path,OVC_ops,0);
% 

%   Copyright © 2014 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

if nargin < 1 || isempty(data_path)
  data_path = '.';
end
if nargin < 2 || isempty(OVC_options)
  %% Default mencoder options, for details please look at the
  %  mencoder documentation, simple adaption of this one should be
  %  simpler
  OVC_options = 'x264 -x264encopts subq=6:frameref=6:bframes=3:weight_b:bitrate=5000';
end
if nargin < 3 || isempty(overwrite)
  overwrite = 0;
end

% Find all avi-files:
if isunix
  [~,avi_files] = my_unix(['find ',data_path,' -name \*.avi']);
else
  % Todo: Check that this actually works! /BG20230623
  Cw = dir2('.','-r','*.avi');
  Cw = char(avi_files.name);
  avi_files = nan(size(Cw,1),size(data_path,2)+size(Cw,2)+1);
  avi_files = char(avi_files);
  for i1 = 1:size(avi_files,1)
    avi_files(i1,:) = fullfile(data_path,Cw(i1,:));
  end

end

pause(1)
OK1 = zeros(size(avi_files,1),1);
OK2 = zeros(size(avi_files,1),1);
msg1 = cell(size(avi_files,1),1);
msg2 = cell(size(avi_files,1),1);

for iFile = 1:size(avi_files,1)
  
  currFile = strtrim(avi_files(iFile,:));
  [fPath,fName,fExt] = fileparts(currFile);
  if abs(overwrite - 1.414213562) < eps
    outname = fName;
  else
    outname = [fName,'-01'];
  end
  outFile = fullfile(fPath,[outname,fExt]);
  %encstr1 = ['mencoder -really-quiet ',currFile,' -ovc ',x264 -x264encopts subq=6:frameref=6:bframes=3:weight_b:bitrate=5000,':pass=1 -o /dev/null'];
  %encstr2 = ['mencoder -really-quiet ',currFile,' -ovc ',x264 -x264encopts subq=6:frameref=6:bframes=3:weight_b:bitrate=5000,':pass=2 -o ',outFile];
  encstr1 = ['mencoder -really-quiet ',currFile,' -ovc ',OVC_options,':pass=1 -o /dev/null'];
  encstr2 = ['mencoder -really-quiet ',currFile,' -ovc ',OVC_options,':pass=2 -o ',outFile];
  
  try
    disp(encstr1)
    [OK1(iFile),msg1{iFile}] = unix(encstr1);
    disp(encstr2)
    [OK2(iFile),msg2{iFile}] = unix(encstr2);
  catch
    disp(['Encountered some problems with file: ',currFile])
    disp('...pushing on...')
  end
  
end
if nargout > 0
  OK1n2 = [OK1(:),OK2(:)];
  msg1n2 = [msg1;msg2];
end
