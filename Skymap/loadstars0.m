function [all_stars,catalog] = loadstars0(varargin)
% LOADSTARS2 load stars from the: Bright Star Catalogue, 5th Revised
% Ed. (Hoffleit+, 1991).
% 
% Calling:
% [all_stars,catalog] = loadstars0
% 
% See also INFOV, PLOTTABLESTARS.


%   Copyright � 2002 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

global stardir


fname = fullfile(stardir,'stars','catalog.dat');
fp = fopen(fname,'r');

catalog(9096,197) = ' ';
cl = 1;
while 1
  line = fgetl(fp); 
  if ~ischar(line)
    break,
  end
  catalog(cl,1:length(line)) = line;
  cl = cl+1;
end
fclose(fp);

Bright_Star_Nr = str2num(catalog(:,1:4));

ra = ( str2num(catalog(:,76:77)) + ...
       str2num(catalog(:,78:79))/60 + ...
       str2num(catalog(:,80:83))/3600 );

decl = str2num(catalog(:,84:86));
decl = decl + (-1).^(decl<0).*( str2num(catalog(:,87:88))/60 + ...
                                str2num(catalog(:,89:90))/3600 );
magn = str2num(catalog(:,103:107));

% all_stars(:,1:5) = [Bright_Star_Nr(:) magn(:) ra(:) decl(:) ];
all_stars(:,1:4) = [Bright_Star_Nr(:) magn(:) ra(:) decl(:) ];
[~,idx_s] = sort(all_stars(:,2));
all_stars = all_stars(idx_s,:);
