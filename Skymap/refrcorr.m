function [apze] = refrcorr(ze,T_ground,p_ground)
% REFRCORR - From true zenith angle to apparent zenith correcting
% for refraction in the atmosphere. This approximation is good to
% within 60 milliarcseconds down to zenith angles of about 75
% degrees.
% 
% Calling:
%  [apze] = refrcorr(ze,T_g,p_g)
% Input: 
%  ZE  - zenith angle (radians).
%  T_g - Temperature at observation-site (C), double scalar,
%        optional parameter, defaults to 10 C
%  p_g - air-pressure at ground-level (kPa), double scalar,
%        optional parameter, defaults to 101 kPa.
% Output:
%   APZE - apparent zenith angle (radians)
% 
% REFRCORR  a simplified correction function for atmospheric
% refraction, after Sæmundson and Þorsteinn (1986).


%   Copyright © 20200917 Bjorn Gustavsson, <bjorn.gustavsson@uit.no>
%   This is free software, licensed under GNU GPL version 2 or later

if nargin < 2 || isempty(T_ground)
  T_ground = 10;
end
if nargin < 3 || isempty(p_ground)
  p_ground = 101;
end

el = (pi/2-ze)*180/pi;
R = p_ground/101*283/(T_ground+273)*(1.02./tand(el+10.3./(el+5.11))/60)*pi/180;
apze = ze - R;
