function [possiblestars,Allstars] = loadstars4spc_man(pos0,date,time0,Allstars)
% LOADSTARS4spc_man load stars from the: Bright Star Catalogue, 5th Revised
% Ed. (Hoffleit+, 1991) and pick the stars that are above the
% horizon at POS0 (longitude, latitude [deg]) at time TIME0 (UTC)
% on the day DATE.
% 
% Calling:
% [possiblestars,catalog] = loadstars2(pos0,date,time0)
% 
% See also INFOV, PLOTTABLESTARS.


%   Copyright � 2002 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

global stardir

%i = 1;
if nargin < 4 || isempty(Allstars)
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
  
  Allstars = [ra decl magn Bright_Star_Nr];
else
  ra   = Allstars(:,1);
  decl = Allstars(:,2);
  magn = Allstars(:,3);
  Bright_Star_Nr = Allstars(:,4);
end

long = pos0(1);
lat = pos0(2);

[az,ze,apze] = starpos2(ra,decl,date,time0,lat,long);
[i] = find(ze<pi/2);

possiblestars(:,1:7) = [az(i) ze(i) i magn(i) zeros(size(i)) Bright_Star_Nr(i) apze(i)];
