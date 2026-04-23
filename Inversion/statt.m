%/* statt.c */
%
%/* Nu tenker jag testa med att goera om den haer funktionen saa att
% * lambda ska vara en bild avrekonstruktionen och n den 'riktiga' bilden. 
% * Det betyder att byta ut N_max mot Nrvox^3 och att hyfsa till indiceringen i n[] & 
% * lambda[]. i funktionen histogram().
% */
%
%/*
% *  These functions makes a Pearson test (? BG 15/6-95) of wether
% *  the projections of the reconstruction give feasible 
% *  size and distribution of the errors compared to the measured images. 
% *  According to Llaser and Veklerov
% */
%
%/* 
% * $Header: statt1.c,v 1.1 97/03/27 07:54:54 bjorn Exp $ 
% */
%/* 
% * $Log:	statt1.c,v $
% * Revision 1.1  97/03/27  07:54:54  07:54:54  bjorn (Bjoern Gustavsson)
% * Initial revision
% * 
% */
%

function [h_val,v_hist] =  statt(n, lambda)

y = ( ( n(:) - lambda(:) ) ./abs(lambda(:)).^.5 );
% I = find(lambda(:) == 0);
% y(I) = min(y(:));
I = lambda(:) == 0;
y(lambda(:) == 0) = min(y(:));

%bin = normal(y);
x2 = [-1.645, -1.282, -1.037, -0.841, -0.675,-0.525, -0.385, -0.253, ...
      -0.125, -0.000,0.125,  0.253,  0.385,  0.525,  0.675,0.841, ...
      1.037,  1.282,  1.645];

%v_hist = histc(y,x2);
v_hist = hist(y,x2);
v_hist = v_hist(1:end-1);
h_val = chi(v_hist);

function [Chi] = chi(v_hist)

hsum = sum(v_hist);

Chi = sum(v_hist-hsum/length(v_hist))*length(v_hist)/hsum;
