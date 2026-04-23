function [C,sigma2C] = Pixel2Pixel(ImStack,m_size)
% PIXEL2PIXEL - p-2-p variation in photo responce non uniformity 
% The p-2-p variation in PRNU is estimated as (ASCII-art _everyone_
% loves ASCII-art)
%          ___ 
%       1 \     
%   C = -  >   I_i./medfilt2(I_i,m_size)
%       N /___ 
%        i =1:N
%
% This works under the assumption that the intensity gradients in
% the images I_i is small and I_i on average is flat and smooth,
% Small-scale structures are supposed to be transient and that
% their contribution are averaged out.
%
% Calling:
% [C,sigma2C] = pixel2pixel(ImStack,m_size)
% Input:
%   ImStack - stack of images, double array [nX x nY x nImgs]
%   M_SIZE  - size of the region to use in the median filtering, 
%             [5 5] seems good.
% Output:
%  C - pixel-to-pixel variation of photo-response non-uniformity,
%      same size as images.
%  sigma2C - standard deviation of C, same size.


%   Copyright © 20050110 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later


C = zeros(size(ImStack(:,:,1)));

ni = C;
for i3 = 1:size(ImStack,3)
  
  d = ImStack(:,:,i3);
  md = medfilt2(d([ones(1,floor(m_size(1)/2)) ...
                   1:end ...
                   end*ones(1,floor(m_size(1)/2))],...
                  [ones(1,floor(m_size(2)/2)) ...
                   1:end ...
                   end*ones(1,floor(m_size(2)/2))]),...
                  m_size);
  md = md(ceil(m_size(1)/2):end-floor(m_size(1)/2),...
          ceil(m_size(2)/2):end-floor(m_size(2)/2));
  
  ifinite = isfinite(md(:));
  C(ifinite) = C(ifinite) + d(ifinite)./md(ifinite);
  ni(ifinite) = ni(ifinite)+1;
end
C = C./ni;

if ( nargout > 1 )
  
  sigma2C = zeros(size(d));
  for i3 = 1:size(ImStack,1)
    
    d = ImStack(:,:,i3);
    d = d./ff;
    sigma2C = sigma2C + 1./( ni - 1 ) .* ( C - d./medfilt2(d,m_size) ).^2;
    
  end
  
end
