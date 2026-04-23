function [SkMp] = checkisok(SkMp)
% 
% "Private" function, not much use for a user to call this function
% 
% CHECKISOK - Callback from checkok. Takes care of loading
% of the star catalog and set up the relevant coordinates.
% 

%   Copyright © 20200918 Bjorn Gustavsson, <bjorn.gustavsson@uit.no>
%   This is free software, licensed under GNU GPL version 2 or later
%
%   Copyright © 20010402 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later



if ( ishandle(SkMp.ui815) )

  pos0(1) = str2double(get(SkMp.ui815,'String'));
  pos0(2) = str2double(get(SkMp.ui816,'String'));
  
  tid0(1) = str2double(get(SkMp.ui86,'String'));
  tid0(2) = str2double(get(SkMp.ui87,'String'));
  tid0(3) = str2double(get(SkMp.ui88,'String'));
  tid0(4) = str2double(get(SkMp.ui89,'String'));
  tid0(5) = str2double(get(SkMp.ui817,'String'));
  tid0(6) = str2double(get(SkMp.ui818,'String'));
  
  SkMp.pos0 = pos0;
  SkMp.tid0 = tid0;
  
  set(SkMp.ui812,'string','loading stars');
  set(SkMp.figchok,'pointer','watch')
  pause(.1)
  
end

%Gotcha! exist does not work on fields only on variables, functions, paths...
%
if (~isfield(SkMp,'oldfov'))
  fov = pi/4;
else
  fov = SkMp.oldfov;
end

if (~isfield(SkMp,'oldmagn'))
  magn = 0;
else
  magn = SkMp.oldmagn;
end

if (~isfield(SkMp,'oldaz0'))
  az0 = 0;
else
  az0 = SkMp.oldaz0;
end

if (~isfield(SkMp,'oldze0'))
  ze0 = 0;
else
  ze0 = SkMp.oldze0;
end

if (~isfield(SkMp,'oldrot0'))
  rot0 = 0;
else
  rot0 = SkMp.oldrot0;
end


if isfield(SkMp,'SAO') && SkMp.SAO
  [possiblestars,star_list] = read_SAO(SkMp.pos0,SkMp.tid0(1:3),SkMp.tid0(4:6));
  SkMp.star_list = star_list;
else  
  [possiblestars,catalog] = loadstars2(SkMp.pos0,SkMp.tid0(1:3),SkMp.tid0(4:6));
  try
    [planetary_positions,planet_list] = planet_positions(SkMp);
  catch
    disp('Planet-position calculation failed - left with the stars')
  end

  if nargin > 1
    
    for i1 = length(possiblestars):-1:1
      
      star_list(possiblestars(i1,3)).Azimuth = possiblestars(i1,1)*180/pi;
      star_list(possiblestars(i1,3)).Zenith = possiblestars(i1,2)*180/pi;
      star_list(possiblestars(i1,3)).App_Zenith = possiblestars(i1,end)*180/pi;
      
    end
    
  else
    
    SkMp.star_list = read_bsc(catalog,possiblestars);
 
    if exist('planet_list','var')
      fix_star_idx3 =  possiblestars(end,3) + abs(planetary_positions(:,3));
      fix_star_idx6 =  possiblestars(end,6) + abs(planetary_positions(:,3));
      planetary_positions(:,3) = fix_star_idx3;
      planetary_positions(:,6) = fix_star_idx6;
      for i_p = 1:numel(fix_star_idx3)
        planet_list(i_p).Bright_Star_Nr = fix_star_idx6(i_p);
      end
      possiblestars = [possiblestars;planetary_positions];
      SkMp.star_list = [SkMp.star_list(:)',planet_list(:)'];
    end
  end
end

[infovstars,SkMp] = infov2(possiblestars,-az0,-ze0,rot0,fov,SkMp);
plottstars = plottablestars2(infovstars,magn);

if ishandle(SkMp.figchok)
  close(SkMp.figchok)
end

SkMp.possiblestars = possiblestars;
SkMp.infovstars = infovstars;
SkMp.plottstars = plottstars;

figure(SkMp.figsky);
[SkMp] = updstrpl(SkMp);
