function err = save_azze(SkMp)
% SAVE_AZZE - Calculates and saves pixel field-of-view az and ze angles 
% SAVE_AZZE automatically calculates the azimuth and zenith angles of all
% pixels of the image currently calibrated. These are then saved to a
% default mat-file (if multiple camera-calibrations are made and this
% function is called after eash calibration the previous az-ze file will
% be carefully backed up) 
%
% SYNOPSIS
%  err = save_azze(SkMp)
%
% This function is automatically called via the GUI.
% The filename of the file is echoed to the command-line. 
% The file contains the matlab-arrays az and ze, with the same sizes as the
% currently calibrated image, and the obs struct holding the most relevant
% meta-data 
% 
% The function returns 0 on successful run, and an error-message when not
% successful. 
%

%   Copyright © 2025 Bjorn Gustavsson, <bjorn.gustavsson@uit.no>
%   This is free software, licensed under GNU GPL version 2 or later

savefile = [genfilename(SkMp, 4),'-azze'];

[u,v] = meshgrid(1:size(SkMp.img,2),1:size(SkMp.img,1));
az = u;
ze = u;
obs = SkMp.obs;

[az(:),ze(:)] = inv_project_directions(u(:)',v(:)',...
                                       SkMp.img,...
                                       [0 0 0],...
                                       SkMp.optmod,SkMp.optpar,...
                                       [0 0 1],1,eye(3));
%
eIS = [sin(SkMp.identstars(1,1))*sin(SkMp.identstars(1,2)),...
       cos(SkMp.identstars(1,1))*sin(SkMp.identstars(1,2)),...
                                  cos(SkMp.identstars(1,2))];
%
u1n = round(SkMp.identstars(1,3));
v1n = round(SkMp.identstars(1,4));
eIsc = [sin(az(v1n,u1n))*sin(ze(v1n,u1n)),...
        cos(az(v1n,u1n))*sin(ze(v1n,u1n)),...  
                         cos(ze(v1n,u1n))];   
if angle_arrays(eIS,eIsc) > pi/2
  % Then we are in a peculiar case and we should better try to fix it 
  if angle_arrays(eIS,-eIsc)*180/pi < 0.5
    disp('Warning the az-ze calculations produce l-o-s vectors anti-perp')
    disp('to where the stars are. Will try to mirror everything. Check results.')
    for i1 = size(az,1):-1:1
      for i2 = size(az,2):-1:1
        eIsc = -[sin(az(i1,i2))*sin(ze(i1,i2)),...
                 cos(az(i1,i2))*sin(ze(i1,i2)),...  
                                  cos(ze(i1,i2))];
        az(i1,i2) = atan2(eIsc(1),eIsc(2));
        ze(i1,i2) = acos(eIsc(3));
      end
    end
  else
    disp('Warning, the az-ze calculations do not produce good results.')
  end
end
fprintf('\nSaving %s...\n', savefile);
err = 0;
try
  % do not overwrite old files, instead keep them renamed as file.mat.001 file.mat.002 osv
  if exist(savefile,'file')
    sprintf('\nBacking up the old file as...');
    counter = '001';
    while exist([savefile, '.', counter],'file')
      counter = num2str(sprintf('%03d', str2num(counter)+1));
    end
    sprintf('%s', [savefile, '.', counter]);
    [mv_status, message] = movefile(savefile, [savefile, '.', counter]);
  end
  save(savefile, 'az', 'ze', 'obs');
catch
  err = -1;
  sprintf('\nWriting %s failed:\n%d:%s\n', savefile, mv_status, message);
end
