function [theta_out,ze_out,ff_out,costheta] = spc_make_theta(gX,gY,optpar,sis,sz_img)
% SPC_MAKE_THETA - Calculate the angle from the optical axis,
% zenith angle and flatfield correction factor for each star
% intensity value.
%
% Calling:
%  [theta_out,ze_out,ff_out] = spc_make_theta(gX,gY,optpar,sis)
% Input:
%  gX     - Array with horizontal image position of stars (pixels)
%           [N x 1]
%  gY     - Array with vertical image position of stars (pixels)
%           [N x 1]
%  optpar - camera parameters describing the imaging geometry, see
%           CAMERA and STARCAL for details.
%  sis    - Star identifier - appears unused!
% Output:
%  theta_out - Array with angles relative to the optical axis.
%  ze_out    - Array with zenith angles.
%  ff_out    - Flat-field/vignetting correction factors


%   Copyright � 20030901 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

% $$$ global bx by

bx = sz_img(2);
by = sz_img(1);

%ffc_raw = ffs_correction_raw([bx by],optpar,optpar(9))/bx/by;
ffc = ffs_correction2([bx by],optpar,optpar(9));

% (
e_n = [0 0 1];
l_0 = 1;
% ) These are really unnecessary?


[u,v] = meshgrid(1:bx,1:by);
[fi,theta] = camera_invmodel(u,v,optpar,optpar(9),[by bx]);
az = fi;
ze = fi;
[az(:),ze(:)] = inv_project_directions(u(:)',v(:)',theta,[],optpar(9),optpar,e_n,l_0);

for i1 = size(gX,1):-1:1
  for j2 = size(gX,2):-1:1
    for i3 = length(gX{i1,j2}):-1:1
      
      % AAaah saa daaligt att goera det haer haer.
      idx1 = max(1,min(sz_img(1),round(gY{i1,j2}(i3))));
      idx2 = max(1,min(sz_img(2),round(gX{i1,j2}(i3))));
      if idx1 == 1 || idx1 == sz_img(1)
        fprintf('Dodgy vertical position for identified star #: %d, %d, %d\n',i1,j2,i3)
      end
      if idx2 == 1 || idx2 == sz_img(2)
        fprintf('Dodgy horizontal position for identified star #: %d, %d, %d\n',i1,j2,i3)
      end
      ff_out{i1,j2}(i3) = ffc(idx1,idx2);
      theta_out{i1,j2}(i3) = theta(idx1,idx2);
      costheta{i1,j2}(i3) = cos(theta_out{i1,j2}(i3));
      ze_out{i1,j2}(i3) = ze(idx1,idx2);
%       ff_out{i1,j2}(i3) = ffc(round(gY{i1,j2}(i3)),round(gX{i1,j2}(i3)));
%       theta_out{i1,j2}(i3) = theta(round(gY{i1,j2}(i3)),round(gX{i1,j2}(i3)));
%       costheta{i1,j2}(i3) = cos(theta_out{i1,j2}(i3));
%       ze_out{i1,j2}(i3) = ze(round(gY{i1,j2}(i3)),round(gX{i1,j2}(i3)));
      
    end
  end
end
