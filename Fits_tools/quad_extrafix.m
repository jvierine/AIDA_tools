function Img = quad_extrafix(Img)
% QUAD_EXTRAFIX - extra balancing of quadrants
% 
% Calling:
%   Img = quad_extrafix(Img)
% INPUT: IMG image that will have quadrants balanced - the
% difference between the lines/columns separating the four halves
% will be subtracted/added. The function takes the average
% difference between the bordering columns and rows and calculates
% the optimal corrections needed to minimize those differences.
%  
%  See also QUADFIX3 REMOVERSCANSTRIP 


%   Copyright � 20101119 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later




%delta12 = median(Img(1:end/2,end/2) - Img(1:end/2,end/2+1));
%delta34 = median(Img(end/2+1:end,end/2) - Img(end/2+1:end,end/2+1));

%delta13 = median(Img(end/2,1:end/2)-Img(end/2+1,1:end/2));
%delta24 = median(Img(end/2,end/2+1:end)-Img(end/2+1,end/2+1:end));

delta12 = mean(median(Img(1:end/2,end/2-[0 1]) - Img(1:end/2,end/2+[1,2]),2));
delta34 = mean(median(Img(end/2+1:end,end/2-[0 1]) - Img(end/2+1:end,end/2+[1,2]),2));

delta13 = mean(median(Img(end/2-[0 1],1:end/2)-Img(end/2+[1,2],1:end/2)));
delta24 = mean(median(Img(end/2-[0 1],end/2+1:end)-Img(end/2+[1,2],end/2+1:end)));

M = [1,-1, 0, 0;
     1, 0,-1, 0;
     0, 1, 0, -1;
     0, 0, 1, -1];

DeltaI = pinv(M)*[delta12;delta13;delta24;delta34];

% Q1 
Img(1:end/2,1:end/2)         = Img(1:end/2,1:end/2)         - DeltaI(1);
% Q2
Img(1:end/2,1+end/2:end)     = Img(1:end/2,1+end/2:end)     - DeltaI(2);
% Q3
Img(1+end/2:end,1:end/2)     = Img(1+end/2:end,1:end/2)     - DeltaI(3);
% Q4
Img(1+end/2:end,1+end/2:end) = Img(1+end/2:end,1+end/2:end) - DeltaI(4);

